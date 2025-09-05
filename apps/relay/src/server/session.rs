use anyhow::Result;
use moqtail::model::{
  control::{constant, control_message::ControlMessage, server_setup::ServerSetup},
  error::TerminationCode,
};
use moqtail::transport::{
  control_stream_handler::ControlStreamHandler,
  data_stream_handler::{HeaderInfo, RecvDataStream},
};
use std::{collections::BTreeMap, sync::Arc};
use tokio::sync::RwLock;
use tracing::{Instrument, debug, error, info, info_span, warn};
use wtransport::{RecvStream, SendStream, endpoint::IncomingSession};

use crate::server::Server;

use super::{
  client::MOQTClient,
  message_handlers,
  session_context::{RequestMaps, SessionContext},
  track::Track,
  utils,
};
use bytes::Bytes;

pub struct Session {}

impl Session {
  pub async fn new(incoming_session: IncomingSession, server: Server) -> Result<Session> {
    let session_request = incoming_session.await?;

    info!(
      "New session: Authority: '{}', Path: '{}', ",
      session_request.authority(),
      session_request.path(),
    );

    let client_manager = server.client_manager.clone();
    let tracks = server.tracks.clone();
    let server_config = server.app_config;
    let relay_fetch_requests = server.relay_fetch_requests.clone();
    let client_fetch_requests = Arc::new(RwLock::new(BTreeMap::new()));
    let relay_subscribe_requests = server.relay_subscribe_requests.clone();
    let client_subscribe_requests = Arc::new(RwLock::new(BTreeMap::new()));
    let relay_next_request_id = server.relay_next_request_id.clone();
    let connection = session_request.accept().await?;

    let request_maps = RequestMaps {
      relay_fetch_requests,
      client_fetch_requests,
      relay_subscribe_requests,
      client_subscribe_requests,
    };

    let context = Arc::new(SessionContext::new(
      server_config,
      client_manager,
      tracks,
      request_maps,
      connection,
      relay_next_request_id,
    ));

    tokio::spawn(Self::handle_connection_close(context.clone()));
    tokio::spawn(Self::accept_control_stream(context.clone()));

    Ok(Session {})
  }

  async fn accept_control_stream(context: Arc<SessionContext>) -> Result<()> {
    match context.connection.accept_bi().await {
      Ok((send_stream, recv_stream)) => {
        let session_context = context.clone();
        let connection_id = session_context.connection_id;
        tokio::spawn(async move {
          if let Err(e) =
            Self::handle_control_messages(session_context.clone(), send_stream, recv_stream)
              .instrument(info_span!("handle_control_messages", connection_id))
              .await
          {
            match e {
              TerminationCode::NoError => {
                info!(
                  "Control stream ended due to client disconnect (connection_id: {})",
                  connection_id
                );
                // Client has already disconnected, no need to close connection
                *session_context.is_connection_closed.write().await = true;
              }
              _ => {
                error!("Error processing control messages: {:?}", e);
                Self::close_session(context.clone(), e, "Error in control stream handler");
              }
            }
          }
        });
        Ok(())
      }
      Err(e) => {
        error!("Failed to accept stream: {:?}", e);
        Self::close_session(
          context.clone(),
          TerminationCode::InternalError,
          "Error in control stream handler",
        );
        Err(e.into())
      }
    }
  }

  async fn handle_control_messages(
    context: Arc<SessionContext>,
    send_stream: SendStream,
    recv_stream: RecvStream,
  ) -> core::result::Result<(), TerminationCode> {
    info!("new control message stream");
    let mut control_stream_handler = ControlStreamHandler::new(send_stream, recv_stream);

    // Client-server negotiation
    let client = match Self::negotiate(context.clone(), &mut control_stream_handler)
      .instrument(info_span!("negotiate", context.connection_id))
      .await
    {
      Ok(client) => client,
      Err(_) => {
        context.connection.close(0u32.into(), b"Negotiation failed");
        return Err(TerminationCode::VersionNegotiationFailed);
      }
    };

    // Set the client in the context
    context.set_client(client.clone()).await;

    // start waiting for unistreams
    let session_context = context.clone();
    tokio::spawn(async move {
      let _ = Self::wait_for_streams(session_context).await;
    });

    // Message loop
    loop {
      // see if we have a message to receive from the client
      let msg: ControlMessage;
      let c = client.read().await; // this is the client that is connected to this session
      {
        tokio::select! {
          m = control_stream_handler.next_message() => {
            msg = match m {
              Ok(m) => {
                info!("received control message: {:?}", m);
                m
              },
              Err(TerminationCode::NoError) => {
                info!("Client disconnected, ending control message loop");
                // Client has already disconnected, no need to close connection
                return Err(TerminationCode::NoError);
              }
              Err(e) => {
                error!("failed to deserialize message: {:?}", e);
                return Err(e);
              }
            };
          },
          m = c.wait_for_next_message() => {
            msg = m;
            info!("new message for client: {:?}", msg);
            if let Err(e) = control_stream_handler.send(&msg).await {
              error!("Error sending message: {:?}", e);
              return Err(e);
            }
            continue;
          },
          else => {
            info!("no message received");
            continue;
          },
        } // end of tokio::select!
      }

      match &msg {
        ControlMessage::Announce(_m) => {
          if let Err(termination_code) =
            message_handlers::handle_announce::handle_announce_messages(
              client.clone(),
              &mut control_stream_handler,
              msg,
              context.clone(),
            )
            .await
          {
            error!("Error handling Announce message: {:?}", termination_code);
            Self::close_session(
              context.clone(),
              termination_code,
              "Error handling Announce message",
            );
            return Err(termination_code);
          }
        }
        ControlMessage::Subscribe(_)
        | ControlMessage::SubscribeOk(_)
        | ControlMessage::Unsubscribe(_) => {
          if let Err(termination_code) =
            message_handlers::handle_subscribe::handle_subscribe_messages(
              client.clone(),
              &mut control_stream_handler,
              msg,
              context.clone(),
            )
            .await
          {
            error!(
              "Error handling Subscribe/Unsubscribe message: {:?}",
              termination_code
            );
            Self::close_session(
              context.clone(),
              termination_code,
              "Error handling Subscribe/Unsubscribe message",
            );
            return Err(termination_code);
          }
        }
        ControlMessage::Fetch(_) | ControlMessage::FetchOk(_) => {
          if let Err(termination_code) = message_handlers::handle_fetch::handle_fetch_messages(
            client.clone(),
            &mut control_stream_handler,
            msg,
            context.clone(),
          )
          .await
          {
            error!("Error handling Fetch message: {:?}", termination_code);
            Self::close_session(
              context.clone(),
              termination_code,
              "Error handling Fetch message",
            );
            return Err(termination_code);
          }
        }

        m => {
          info!("some message received");
          let a = m.serialize().unwrap();
          let buf = Bytes::from_iter(a);
          utils::print_bytes(&buf);
        }
      } // end of match &msg
    } // end of loop
  }

  fn close_session(context: Arc<SessionContext>, error_code: TerminationCode, msg: &str) {
    context
      .connection
      .close(error_code.to_u32().into(), msg.as_bytes());
  }

  // TODO: in an error close the connection
  async fn wait_for_streams(context: Arc<SessionContext>) -> Result<()> {
    info!(
      "wait_for_streams | connection id: {}",
      context.connection_id
    );
    loop {
      let session_context = context.clone();
      if *session_context.is_connection_closed.read().await {
        info!(
          "Connection closed, stopping stream acceptance for connection {}",
          session_context.connection_id
        );
        return Ok(());
      }
      tokio::select! {
        _ = context.connection.accept_bi()  => {
          error!("One bi-directional stream is allowed per connection | connection id: {}", context.connection_id);
          Self::close_session(context.clone(), TerminationCode::ProtocolViolation, "One bi-directional stream is allowed per connection");
          return Ok(());
        }

        stream = context.connection.accept_uni() => {
          tokio::spawn(async move {
            let stream = match stream {
              Ok(stream) => {
                stream
              },
              Err(e) => {
                // TODO: do we need to close the connection here?
                error!("Failed to accept unidirectional stream: {:?}", e);
                return;
              }
            };

            Self::handle_uni_stream(
              session_context,
              stream,
            ).await.unwrap_or_else(|e| {
              error!("Error processing unidirectional stream: {:?}", e);
            });
          });
        }

        _ = context.connection.receive_datagram() => {
          let connection_id = context.connection_id;
          tokio::spawn(async move {
            debug!("Received (dgram) from client {}", connection_id);
          });
        }
      }
    }
  }

  async fn handle_connection_close(context: Arc<SessionContext>) -> Result<()> {
    let client_manager_cleanup = context.client_manager.clone();
    let tracks_cleanup = context.tracks.clone();

    debug!(
      "handle_connection_close | waiting ({})",
      context.connection_id
    );
    context.connection.closed().await;

    // set the connection closed flag
    {
      *context.is_connection_closed.write().await = true;
    }

    info!(
      "handle_connection_close | connection closed ({})",
      context.connection_id
    );

    // Check if the disconnecting client is a publisher and handle track cleanup
    let mut tracks_to_remove = Vec::new();
    {
      let tracks = tracks_cleanup.read().await;
      let client = context.get_client().await;
      if let Some(client) = client {
        let client = client.read().await;
        let published_tracks = client.get_published_tracks().await;
        for track_alias in published_tracks {
          info!(
            "Track {} belongs to disconnected publisher {}, notifying subscribers",
            track_alias, context.connection_id
          );

          match tracks.get(&track_alias) {
            Some(track) => {
              if track.publisher_connection_id == context.connection_id {
                // check if the track belongs to the disconnected publisher
                // even though, this comes from the client's published tracks
                if track.publisher_connection_id == context.connection_id {
                  info!(
                    "Track {} belongs to disconnected publisher {}, notifying subscribers",
                    track_alias, context.connection_id
                  );
                }

                // Notify all subscribers that the publisher disconnected
                if let Err(e) = track.notify_publisher_disconnected().await {
                  error!(
                    "Failed to notify subscribers for track {}: {:?}",
                    track_alias, e
                  );
                }

                tracks_to_remove.push(track_alias);
              }
            }
            None => {
              warn!(
                "Track {} not found in removing tracks as the client {} disconnected",
                track_alias, context.connection_id
              );
            }
          }
        }
      }
    }

    // Remove tracks that belonged to the disconnected publisher
    if !tracks_to_remove.is_empty() {
      let mut tracks = tracks_cleanup.write().await;
      for track_alias in tracks_to_remove {
        tracks.remove(&track_alias);
        info!(
          "Removed track {} after publisher {} disconnect",
          track_alias, context.connection_id
        );
      }
    }

    // Remove client from client_manager
    let mut cm = client_manager_cleanup.write().await;
    cm.remove(context.connection_id).await;

    // Remove client from all remaining tracks (as a subscriber)
    for (_, track) in tracks_cleanup.write().await.iter_mut() {
      track.remove_subscription(context.connection_id).await;
    }

    debug!(
      "handle_connection_close | cleanup done ({})",
      context.connection_id
    );
    Ok(())
  }

  async fn handle_uni_stream(context: Arc<SessionContext>, stream: RecvStream) -> Result<()> {
    debug!("accepted unidirectional stream");
    let client = context.get_client().await;
    let client = match client {
      Some(c) => c,
      None => return Err(TerminationCode::InternalError.into()),
    };

    let client = client.read().await;

    debug!("client is {}", client.connection_id);

    let mut stream_handler = &RecvDataStream::new(stream, client.fetch_requests.clone());

    let mut first_object = true;
    let mut track_alias = 0u64;
    let mut stream_id = String::new();
    let mut current_track: Option<Track> = None;

    let mut object_count = 0;

    loop {
      let next = stream_handler.next_object().await;

      match next {
        (handler, Some(object)) => {
          // Handle the object
          stream_handler = handler;

          let header_info = if first_object {
            // debug!("First object received, processing header info");
            let header = handler.get_header_info().await;
            if header.is_none() {
              error!("no header info found, terminating session");
              return Err(anyhow::Error::msg(TerminationCode::InternalError.to_json()));
            }

            // Unwrap the header info
            let header_info = header.unwrap();

            match header_info {
              HeaderInfo::Subgroup { header } => {
                debug!("received Subgroup header: {:?}", header);
                track_alias = header.track_alias;
              }
              HeaderInfo::Fetch {
                header,
                fetch_request: _,
              } => {
                debug!("received Fetch header: {:?}", header);
                let fetch_request_id = header.request_id;
                track_alias = client
                  .fetch_requests
                  .read()
                  .await
                  .get(&fetch_request_id)
                  .map_or(0, |r| r.track_alias);
              }
            }

            current_track = if let Some(track) = context.tracks.read().await.get(&track_alias) {
              debug!("track found: {:?}", track_alias);
              Some(track.clone())
            } else {
              // this means, there is no subscription message came for this track yet
              error!("track not found: {:?}", track_alias);

              // TODO: what is the right way to handle this?
              // TODO: get track for fetch requests as well
              return Err(anyhow::Error::msg(TerminationCode::InternalError.to_json()));
            };
            stream_id = utils::build_stream_id(track_alias, &header_info);
            Some(header_info)
          } else {
            None
          };

          let track = current_track.as_ref().unwrap();
          let _ = if first_object {
            track
              .new_object_with_header(stream_id.clone(), &object, header_info.as_ref())
              .await
          } else {
            track.new_object(stream_id.clone(), &object).await
          };

          object_count += 1;
          first_object = false; // reset the first object flag after processing the header
        }
        (_, None) => {
          // error!("Failed to receive object: {:?}", e);
          info!(
            "no more objects in the stream track: {}, stream_id: {}, objects: {}",
            track_alias, stream_id, object_count
          );
          // Close the stream for all subscribers
          if let Some(track) = &current_track {
            return track.stream_closed(stream_id.clone()).await;
          }
          break;
        }
      }
    }

    Ok(())
  }

  pub(crate) async fn get_next_relay_request_id(relay_next_request_id: Arc<RwLock<u64>>) -> u64 {
    let current_request_id = *relay_next_request_id.read().await;
    // increment by 2 for the next request
    *relay_next_request_id.write().await = current_request_id + 2;
    current_request_id
  }

  async fn negotiate(
    context: Arc<SessionContext>,
    control_stream_handler: &mut ControlStreamHandler,
  ) -> Result<Arc<RwLock<MOQTClient>>> {
    debug!("Negotiating with client...");
    let client_setup = match control_stream_handler.next_message().await {
      Ok(ControlMessage::ClientSetup(m)) => *m,
      Ok(_) => {
        error!("Unexpected message received");
        return Err(anyhow::Error::msg(
          TerminationCode::ProtocolViolation.to_json(),
        ));
      }
      Err(TerminationCode::NoError) => {
        info!("Client disconnected during negotiation");
        return Err(anyhow::Error::msg("Client disconnected during negotiation"));
      }
      Err(e) => {
        error!("Failed to deserialize message: {:?}", e);
        return Err(anyhow::Error::msg(e.to_json()));
      }
    };

    utils::print_msg_bytes(&client_setup);

    let server_setup = ServerSetup::new(constant::DRAFT_11, vec![]);

    debug!("client setup: {:?}", client_setup.supported_versions);
    debug!("server setup: {:?}", server_setup);

    let client = if client_setup
      .supported_versions
      .contains(&constant::DRAFT_11)
    {
      let mut m = context.client_manager.write().await;

      let client = MOQTClient::new(
        context.connection_id,
        Arc::new(context.connection.clone()),
        Arc::new(client_setup),
      );
      let client = Arc::new(RwLock::new(client));
      m.add(client.clone()).await;
      client
    } else {
      warn!("unsupported version");
      return Err(anyhow::Error::msg(
        TerminationCode::VersionNegotiationFailed.to_json(),
      ));
    };

    match control_stream_handler.send_impl(&server_setup).await {
      Ok(_) => {
        debug!("Sent server setup to client");
        Ok(client)
      }
      Err(e) => {
        error!("Failed to send server setup: {:?}", e);
        Err(anyhow::Error::msg(TerminationCode::InternalError.to_json()))
      }
    }
  }
}
