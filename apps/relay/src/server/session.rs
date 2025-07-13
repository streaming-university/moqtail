use crate::server::config::AppConfig;

use super::{client::MOQTClient, client_manager::ClientManager, track::Track, utils};
use anyhow::Result;
use bytes::Bytes;
use moqtail::model::{
  common::reason_phrase::ReasonPhrase,
  control::{
    announce_ok::AnnounceOk, constant, control_message::ControlMessage, server_setup::ServerSetup,
  },
  error::TerminationCode,
};
use moqtail::transport::{
  control_stream_handler::ControlStreamHandler,
  data_stream_handler::{HeaderInfo, RecvDataStream, SubscribeRequest},
};
use std::{collections::BTreeMap, sync::Arc};
use tokio::sync::RwLock;
use tracing::{Instrument, debug, error, info, info_span, warn};
use wtransport::{Connection, RecvStream, SendStream, endpoint::IncomingSession};
pub struct SessionContext {
  pub(self) client_manager: Arc<RwLock<ClientManager>>,
  pub(self) tracks: Arc<RwLock<BTreeMap<u64, Track>>>, // the tracks the relay is subscribed to, key is the track alias
  pub(self) connection_id: usize,
  pub(self) client: Arc<RwLock<Option<Arc<RwLock<MOQTClient>>>>>, // the client that is connected to this session
  pub(self) connection: Connection,
  pub(self) server_config: &'static AppConfig,
}

impl SessionContext {
  pub fn new(
    server_config: &'static AppConfig,
    client_manager: Arc<RwLock<ClientManager>>,
    tracks: Arc<RwLock<BTreeMap<u64, Track>>>,
    connection: Connection,
  ) -> Self {
    Self {
      client_manager,
      tracks,
      connection_id: connection.stable_id(),
      client: Arc::new(RwLock::new(None)), // initially no client is set
      connection,
      server_config,
    }
  }

  pub async fn set_client(&self, client: Arc<RwLock<MOQTClient>>) {
    let mut c = self.client.write().await;
    *c = Some(client);
  }

  pub async fn get_client(&self) -> Arc<RwLock<MOQTClient>> {
    let c = self.client.read().await;
    c.as_ref().unwrap().clone()
  }
}
pub struct Session {}

impl Session {
  pub async fn new(
    incoming_session: IncomingSession,
    client_manager: Arc<RwLock<ClientManager>>,
    tracks: Arc<RwLock<BTreeMap<u64, Track>>>,
    server_config: &'static AppConfig,
  ) -> Result<Session> {
    let session_request = incoming_session.await?;

    info!(
      "New session: Authority: '{}', Path: '{}', ",
      session_request.authority(),
      session_request.path(),
    );

    let connection = session_request.accept().await?;

    let context = Arc::new(SessionContext::new(
      server_config,
      client_manager,
      tracks,
      connection,
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
          Self::handle_control_messages(session_context, send_stream, recv_stream)
            .instrument(info_span!("handle_control_messages", connection_id))
            .await
            .unwrap_or_else(|e| {
              error!("Error processing control messages: {:?}", e);
            });
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
      tokio::select! {
        _ = context.connection.accept_bi()  => {
          error!("One bi-directional stream is allowed per connection");
          Self::close_session(context.clone(), TerminationCode::ProtocolViolation, "One bi-directional stream is allowed per connection");
          return Err(anyhow::Error::msg(
            TerminationCode::ProtocolViolation.to_json(),
          ));
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
    info!(
      "handle_connection_close | connection closed ({})",
      context.connection_id
    );
    // Remove client from client_manager
    let mut cm = client_manager_cleanup.write().await;
    cm.remove(context.connection_id).await;
    // Remove client from all tracks
    for (_, track) in tracks_cleanup.write().await.iter_mut() {
      track.remove_subscription(context.connection_id).await;
    }
    // TODO: subscribe_cancel if every client is removed from the track
    debug!(
      "handle_connection_close | cleanup done ({})",
      context.connection_id
    );
    Ok(())
  }

  async fn handle_uni_stream(context: Arc<SessionContext>, stream: RecvStream) -> Result<()> {
    debug!("accepted unidirectional stream");
    let client = context.get_client().await;
    let client = client.read().await;

    debug!("client is {}", client.connection_id);

    let mut stream_handler = &RecvDataStream::new(stream, client.fetch_requests.clone());

    let mut first_object = true;
    let mut track_alias = 0u64;
    let mut header_id = String::new();
    let mut current_track: Option<Track> = None;

    let mut object_count = 0;

    loop {
      let next = stream_handler.next_object().await;
      match next {
        (handler, Some(object)) => {
          // Handle the object
          stream_handler = handler;

          if first_object {
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
            let _ = current_track
              .as_ref()
              .unwrap()
              .new_header(&header_info)
              .await;
            header_id = utils::build_header_id(&header_info);
          }
          let track = current_track.as_ref().unwrap();
          let _ = track.new_object(header_id.clone(), &object).await;

          object_count += 1;
          first_object = false; // reset the first object flag after processing the header
        }
        (_, None) => {
          // error!("Failed to receive object: {:?}", e);
          debug!(
            "no more objects in the stream track: {}, header_id: {}, objects: {}",
            track_alias, header_id, object_count
          );
          // Close the stream for all subscribers
          if let Some(track) = &current_track {
            track.stream_closed(header_id.clone()).await;
          }
          break;
        }
      }
    }

    Ok(())
  }

  async fn handle_control_messages(
    context: Arc<SessionContext>,
    send_stream: SendStream,
    recv_stream: RecvStream,
  ) -> Result<()> {
    info!("new control message stream");
    let mut control_stream_handler = ControlStreamHandler::new(send_stream, recv_stream);

    // the server's Request ID starts at 1 and are odd
    // The Request ID increments by 2 with ANNOUNCE, FETCH,
    // SUBSCRIBE, SUBSCRIBE_ANNOUNCES or TRACK_STATUS request.
    let relay_next_request_id = Arc::new(RwLock::new(1u64));

    // Client-server negotiation
    let client = match Self::negotiate(context.clone(), &mut control_stream_handler)
      .instrument(info_span!("negotiate", context.connection_id))
      .await
    {
      Ok(client) => client,
      Err(err) => {
        context.connection.close(0u32.into(), b"Negotiation failed");
        return Err(err);
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
              Err(e) => {
                error!("failed to deserialize message: {:?}", e);
                return Err::<(), anyhow::Error>(anyhow::Error::msg(TerminationCode::InternalError.to_json()));
              }
            };
          },
          m = c.wait_for_next_message() => {
            msg = m;
            info!("received message from client: {:?}", msg);
            control_stream_handler.send(&msg).await.unwrap();
            continue;
          },
          else => {
            info!("no message received");
            continue;
          },
        }
      }

      match msg {
        ControlMessage::Announce(m) => {
          // TODO: the namespace is already announced, return error
          info!("received Announce message");
          // this is a publisher, add it to the client manager
          // send announce_ok
          client
            .read()
            .await
            .add_announced_track_namespace(m.track_namespace.clone())
            .await;
          let announce_ok = Box::new(AnnounceOk {
            request_id: m.request_id,
          });
          control_stream_handler
            .send(&ControlMessage::AnnounceOk(announce_ok))
            .await
            .unwrap()
        }
        ControlMessage::Subscribe(m) => {
          info!("received Subscribe message: {:?}", m);
          let sub = *m;
          let track_namespace = sub.track_namespace.clone();
          let client = context.get_client().await;

          // find who is the publisher
          let publisher = {
            debug!("trying to get the publisher");
            let m = context.client_manager.read().await;
            debug!(
              "client manager obtained, current client id: {}",
              context.connection_id
            );
            m.get_publisher_by_announced_track_namespace(&track_namespace)
              .await
          };

          let publisher = if let Some(publisher) = publisher {
            publisher.clone()
          } else {
            error!(
              "no publisher found for track namespace: {:?}",
              track_namespace
            );
            // send SubscribeError
            let subscribe_error = moqtail::model::control::subscribe_error::SubscribeError::new(
              sub.request_id,
              moqtail::model::control::constant::SubscribeErrorCode::TrackDoesNotExist,
              ReasonPhrase::try_new("Unknown track namespace".to_string()).unwrap(),
              sub.track_alias,
            );
            control_stream_handler
              .send_impl(&subscribe_error)
              .await
              .unwrap();
            continue;
          };

          {
            publisher
              .read()
              .await
              .add_subscriber(context.connection_id)
              .await;
          }
          info!(
            "Subscriber ({}) added to the publisher ({})",
            context.connection_id,
            publisher.read().await.connection_id
          );

          if !context.tracks.read().await.contains_key(&sub.track_alias) {
            info!("Track not found, creating new track: {:?}", sub.track_alias);
            // subscribed_tracks.insert(sub.track_alias, Track::new(sub.track_alias, track_namespace.clone(), sub.track_name.clone()));
            let mut track = Track::new(
              sub.track_alias,
              sub.track_namespace.clone(),
              sub.track_name.clone(),
              context.server_config.cache_size.into(),
            );
            {
              context
                .tracks
                .write()
                .await
                .insert(sub.track_alias, track.clone());
            }
            let _ = track.add_subscription(client.clone(), sub.clone()).await;

            // send the subscribe message to the publisher
            let mut new_sub = sub.clone();
            let original_request_id = sub.request_id;
            new_sub.request_id =
              Self::get_next_relay_request_id(relay_next_request_id.clone()).await;

            let publisher = publisher.read().await;
            publisher
              .queue_message(ControlMessage::Subscribe(Box::new(new_sub.clone())))
              .await;

            // insert this request id into the requests to the publisher
            // We'll need it when we get the response from the publisher
            // TODO: we need to add a timeout here or another loop to control expired requests
            let req =
              SubscribeRequest::new(original_request_id, context.connection_id, new_sub.clone());
            let mut requests = publisher.subscribe_requests.write().await;
            requests.insert(new_sub.request_id, req.clone());
            debug!(
              "inserted request into publisher's subscribe requests: {:?}",
              req
            );
          } else {
            info!("track already exists, sending SubscribeOk");
            let mut tracks = context.tracks.write().await;
            let track = tracks.get_mut(&sub.track_alias).unwrap();
            let _ = track.add_subscription(client.clone(), sub.clone()).await;
            drop(tracks);
            // TODO: Send the first sub_ok message to the subscriber
            // for now, just sending some default values
            let subscribe_ok =
              moqtail::model::control::subscribe_ok::SubscribeOk::new_ascending_with_content(
                sub.request_id,
                0,
                None,
                None,
              );

            control_stream_handler
              .send_impl(&subscribe_ok)
              .await
              .unwrap();
          }
        }
        ControlMessage::SubscribeOk(m) => {
          info!("received SubscribeOk message: {:?}", m);
          let msg = *m;
          let client = context.get_client().await;
          let client = client.read().await;
          // this comes from the publisher
          // it should be sent to the subscriber
          let request_id = msg.request_id;

          /* TODO: requests are keyed with track_id, not request_id
                    That's a problem. Different requests can have the same track_id but
                    from different subscribers.
          */
          let mut sub_request = {
            let requests = client.subscribe_requests.read().await;
            // print out every request
            debug!("current requests: {:?}", requests);
            match requests.get(&request_id) {
              Some(m) => {
                info!("request id is verified: {:?}", request_id);
                m.clone()
              }
              None => {
                warn!("request id is not verified: {:?}", request_id);
                continue;
              }
            }
          };

          // replace the request id with the original request id
          sub_request.subscribe_request.request_id = sub_request.original_request_id;

          // TODO: honor the values in the subscribe_ok message like
          // expires, group_order, content_exists, largest_location

          // now we're ready to send the subscribe_ok message to the subscriber
          let subscribe_ok =
            moqtail::model::control::subscribe_ok::SubscribeOk::new_ascending_with_content(
              sub_request.original_request_id,
              msg.expires,
              msg.largest_location,
              None,
            );
          // send the subscribe_ok message to the subscriber
          let subscriber = {
            let mngr = context.client_manager.read().await;
            mngr.get(sub_request.requested_by).await
          };

          if subscriber.is_none() {
            warn!("subscriber not found");
            continue;
          }

          debug!("subscriber found: {:?}", sub_request.requested_by);
          let subscriber = subscriber.unwrap();

          info!(
            "sending SubscribeOk to subscriber: {:?}, msg: {:?}",
            sub_request.requested_by, &subscribe_ok
          );

          subscriber
            .read()
            .await
            .queue_message(ControlMessage::SubscribeOk(Box::new(subscribe_ok)))
            .await;
          drop(subscriber);

          /*
          TODO: do we need to update the subscription with the incoming subscribe_ok message?
          */

          // remove the request from the publisher
          debug!("removing request from publisher: {:?}", request_id);

          // don't get confused, client is the publisher here
          // TODO: the following line panics...
          client.subscribe_requests.write().await.remove(&request_id);

          // add the track to the subscribed tracks
          info!(
            "adding track to subscribed tracks: {:?}",
            sub_request.subscribe_request.track_alias
          );
        }
        ControlMessage::Unsubscribe(m) => {
          info!("received Unsubscribe message: {:?}", m);
          // TODO: implement
          // let msg = *m;
        }
        m => {
          info!("some message received");
          let a = m.serialize().unwrap();
          let buf = Bytes::from_iter(a);
          utils::print_bytes(&buf);
        }
      }
    }
  }

  async fn get_next_relay_request_id(relay_next_request_id: Arc<RwLock<u64>>) -> u64 {
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
      Err(e) => {
        error!("Failed to deserialize message: {:?}", e);
        return Err(anyhow::Error::msg(TerminationCode::InternalError.to_json()));
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
