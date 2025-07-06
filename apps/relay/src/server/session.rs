use crate::server::config::AppConfig;

use super::{client::MOQTClient, client_manager::ClientManager, track::Track, utils};
use anyhow::Result;
use bytes::Bytes;
use dashmap::DashMap;
use moqtail::model::{
  common::reason_phrase::ReasonPhrase,
  control::{
    announce_ok::AnnounceOk, constant, control_message::ControlMessage, server_setup::ServerSetup,
  },
  data::subgroup_object::SubgroupObject,
  error::TerminationCode,
};
use moqtail::transport::{
  control_stream_handler::ControlStreamHandler,
  data_stream_handler::{HeaderInfo, RecvDataStream, SubscribeRequest},
};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tracing::{Instrument, debug, error, info, info_span, warn};
use wtransport::{Connection, RecvStream, SendStream, endpoint::IncomingSession};
pub struct SessionContext {
  pub client_manager: Arc<RwLock<ClientManager>>,
  pub tracks: Arc<DashMap<u64, Track>>, // the tracks the relay is subscribed to, key is the track alias
  pub connection_id: usize,
  connection: Connection,
  server_config: &'static AppConfig,
}

impl SessionContext {
  pub fn new(
    server_config: &'static AppConfig,
    client_manager: Arc<RwLock<ClientManager>>,
    tracks: Arc<DashMap<u64, Track>>,
    connection: Connection,
  ) -> Self {
    Self {
      client_manager,
      tracks,
      connection_id: connection.stable_id(),
      connection,
      server_config,
    }
  }
}
pub struct Session {}

impl Session {
  pub async fn new(
    incoming_session: IncomingSession,
    client_manager: Arc<RwLock<ClientManager>>,
    tracks: Arc<DashMap<u64, Track>>,
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

        dgram = context.connection.receive_datagram() => {
          let connection_id = context.connection_id;
          tokio::spawn(async move {
            debug!("Received datagram");
            let dgram = dgram.unwrap();
            let str_data = std::str::from_utf8(&dgram).unwrap();
            info!("Received (dgram) '{str_data}' from client {}", connection_id);
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
    for mut track in tracks_cleanup.iter_mut() {
      track
        .value_mut()
        .remove_subscriber(&context.connection_id)
        .await;
    }
    debug!(
      "handle_connection_close | cleanup done ({})",
      context.connection_id
    );
    Ok(())
  }

  async fn handle_uni_stream(context: Arc<SessionContext>, stream: RecvStream) -> Result<()> {
    debug!("accepted unidirectional stream");
    // Find out which client I am
    // when we lock client manager, we should do it in a small block
    // to narrow the scope and let it be released as soon as possible
    // however, this lock is not enough. we need to lock the client object
    // TODO: Refactor client_manager to use Mutex<MOQTClient> and
    // add a getter function that locks the client manager and returns the client
    let client = {
      let clients = context.client_manager.read().await;
      match clients.get(context.connection_id).await {
        Some(c) => c.clone(),
        None => {
          error!(
            "handle_uni_stream | No client found! Connection id: {}",
            context.connection_id
          );
          return Err(anyhow::Error::msg(TerminationCode::InternalError.to_json()));
        }
      }
    };
    let client = client.read().await;

    debug!("client is {}", client.connection_id);

    let stream = Arc::new(Mutex::new(stream));

    let mut stream_handler = &RecvDataStream::new(stream.clone(), client.fetch_requests.clone());

    let mut first_object = true;
    let mut stream_id: String = "".into();
    let mut track_alias = 0u64;
    let mut group_id;
    let mut header_id = String::new();
    let mut header_payload = Bytes::new();
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
                let subgroup_id = header.subgroup_id.unwrap_or(0);
                group_id = header.group_id;
                track_alias = header.track_alias;
                stream_id = format!("{track_alias}_subgroup_{group_id}_{subgroup_id}");
                header_payload = header.serialize().unwrap();
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
                header_payload = header.serialize().unwrap();
                stream_id = format!("{track_alias}_fetch_{fetch_request_id}");
              }
            }

            current_track = if let Some(track) = context.tracks.get(&track_alias) {
              debug!("track found: {:?}", track_alias);
              Some(track.clone())
            } else {
              // this means, there is no subscription message came for this track yet
              error!("track not found: {:?}", track_alias);
              /*
              Self::write_to_track_log(
                track_alias,
                &format!("Track not found: {:?}, waiting...", track_alias),
              )
              .await?;
              */
              // TODO: what is the right way to handle this?
              // TODO: get track for fetch requests as well
              return Err(anyhow::Error::msg(TerminationCode::InternalError.to_json()));
            };
            current_track
              .as_ref()
              .unwrap()
              .add_header(header_info.clone())
              .await;
            header_id = utils::build_header_id(&header_info);
          }
          let track = current_track.as_ref().unwrap();
          track.add_object(header_id.clone(), object.clone()).await;

          object_count += 1;

          let subscriber_ids = {
            let subscribers_arc = track.get_subscribers();
            let subscribers_arc = subscribers_arc.read().await;
            subscribers_arc.keys().copied().collect::<Vec<usize>>()
          };

          let has_extensions = object.extensions.is_some();
          let object_variant = object.try_into_subgroup()?;

          for subscriber_id in subscriber_ids {
            // spawn another task
            // TODO: use mpsc
            tokio::spawn(Self::send_subgroup_obj_to_subscriber(
              context.clone(),
              track_alias,
              stream_id.clone(),
              subscriber_id,
              first_object,
              header_payload.clone(),
              object_variant.clone(),
              has_extensions,
            ));
          }

          first_object = false; // reset the first object flag after processing the header
        }
        (_, None) => {
          // error!("Failed to receive object: {:?}", e);
          debug!(
            "no more objects in the stream {}, objects: {}",
            stream_id, object_count
          );
          // Close the stream for all subscribers
          if let Some(track) = &current_track {
            let subscribers_arc = track.get_subscribers();
            let subscribers = subscribers_arc.read().await;
            for (subscriber_id, s) in subscribers.iter() {
              let subscriber = s.read().await;
              debug!(
                "closing stream for subscriber: {:?}, stream_id: {}, objects: {}",
                subscriber_id, stream_id, object_count
              );
              subscriber.close_stream(&stream_id).await?;
            }
          }
          break;
        }
      }
    }

    Ok(())
  }

  #[allow(clippy::too_many_arguments)]
  async fn send_subgroup_obj_to_subscriber(
    context: Arc<SessionContext>,
    track_alias: u64,
    stream_id: String,
    subscriber_id: usize,
    first_object: bool,
    header_payload: Bytes,
    object_variant: SubgroupObject,
    has_extensions: bool,
  ) {
    // serialize the header info
    let mut the_stream = None;

    let track = match context.tracks.get(&track_alias) {
      Some(t) => t,
      None => {
        error!(
          "track not found! track_alias: {} stream_id: {}",
          &track_alias, &stream_id
        );
        return;
      }
    };
    let subscribers_arc = track.get_subscribers();
    let subscribers = subscribers_arc.read().await;
    let subscriber = match subscribers.get(&subscriber_id) {
      Some(s) => s,
      None => {
        error!(
          "subscriber not found! track_alias: {} stream_id: {}",
          &track_alias, &stream_id
        );
        return;
      }
    };

    if first_object {
      info!(
        "opening stream for subscriber: {:?} stream_id: {}",
        subscriber_id, stream_id
      );
      /*
      Self::write_to_track_log(
        track_alias,
        &format!(
          "Opening stream for subscriber: {:?}, stream_id: {}",
          subscriber_id, stream_id
        ),
      )
      .await?;
      */

      let subscriber = subscriber.read().await;

      // TODO: handle errors here
      the_stream = match subscriber
        .open_stream(&stream_id, header_payload.clone())
        .await
      {
        Ok(stream) => Some(stream),
        Err(e) => {
          error!(
            "Error in opening stream for subscriber {}, error: {:?}",
            subscriber.connection_id, e
          );
          return;
        }
      };
    }

    /*
    Self::write_to_track_log(
      track_alias,
      &format!(
        "Sending object to subscriber: {:?}, stream_id: {}, object_count: {}",
        subscriber_id, stream_id, object_count
      ),
    )
    .await?;
    */

    let object_bytes = match object_variant.serialize(has_extensions) {
      Ok(data) => data,
      Err(e) => {
        error!(
          "Error in serializing object before writing to stream for subscriber {}, error: {:?}",
          subscriber_id, e
        );
        return;
      }
    };

    let subscriber = subscriber.read().await;
    match subscriber
      .write_object_to_stream(
        &stream_id,
        object_variant.object_id,
        object_bytes,
        the_stream.clone(),
      )
      .await
    {
      Ok(_) => {}
      Err(e) => {
        error!(
          "Error in writing to stream for subscriber {}, error: {:?}",
          subscriber.connection_id, e
        )
      }
    }
  }

  /*
  async fn write_to_track_log(track_alias: u64, message: &str) -> Result<()> {
    let log_file_name = format!("track_{}.log", track_alias);
    let mut file = std::fs::OpenOptions::new()
      .create(true)
      .append(true)
      .open(std::path::Path::new(&log_file_name))
      .map_err(|e| {
        error!("Failed to open log file: {:?}", e);
        anyhow::Error::msg(TerminationCode::InternalError.to_json())
      })?;

    writeln!(file, "{}", message).map_err(|e| {
      error!("Failed to write to log file: {:?}", e);
      anyhow::Error::msg(TerminationCode::InternalError.to_json())
    })?;

    Ok(())
  }
  */

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

    // start waiting for unistreams
    let session_context = context.clone();
    tokio::spawn(async move {
      let _ = Self::wait_for_streams(session_context).await;
    });

    // Message loop
    loop {
      // see if we have a message to receive from the client
      let msg: ControlMessage;

      {
        let client = client.read().await;
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
          m = client.wait_for_next_message() => {
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
            .write()
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

          // find the track
          // TODO: is this the right place to add the subscriber or getting ok from the subscriber?
          // maybe we can remove this in the future
          {
            debug!(
              "Adding a subscriber ({}) to the publisher",
              context.connection_id
            );
            publisher
              .read()
              .await
              .add_subscriber(context.connection_id)
              .await;
            info!(
              "Subscriber added to the publisher ({})",
              context.connection_id
            );
          }

          if !context.tracks.contains_key(&sub.track_alias) {
            info!("Track not found, creating new track: {:?}", sub.track_alias);
            let publisher = publisher.read().await;
            // subscribed_tracks.insert(sub.track_alias, Track::new(sub.track_alias, track_namespace.clone(), sub.track_name.clone()));
            let mut track = Track::new(
              sub.track_alias,
              sub.track_namespace.clone(),
              sub.track_name.clone(),
              context.server_config.cache_size.into(),
            );
            track
              .add_subscriber((context.connection_id, client.clone()))
              .await;
            context.tracks.insert(sub.track_alias, track.clone());

            // send the subscribe message to the publisher
            let mut new_sub = sub.clone();
            let original_request_id = sub.request_id;
            new_sub.request_id =
              Self::get_next_relay_request_id(relay_next_request_id.clone()).await;

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
            let mut track = context.tracks.get_mut(&sub.track_alias).unwrap();
            track
              .add_subscriber((context.connection_id, client.clone()))
              .await;

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
          // this comes from the publisher
          // it should be sent to the subscriber
          let request_id = msg.request_id;

          /* TODO: requests are keyed with track_id, not request_id
                    That's a problem. Different requests can have the same track_id but
                    from different subscribers.
          */
          let mut sub_request = {
            let client = client.read().await;
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

          let mut track = context
            .tracks
            .get_mut(&sub_request.subscribe_request.track_alias)
            .unwrap();

          track
            .add_subscriber((sub_request.requested_by, subscriber.clone()))
            .await;

          // remove the request from the publisher
          debug!("removing request from publisher: {:?}", request_id);

          // don't get confused, client is the publisher here
          // TODO: the following line panics...
          client
            .read()
            .await
            .subscribe_requests
            .write()
            .await
            .remove(&request_id);

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

    let client: Arc<RwLock<MOQTClient>>;

    if client_setup
      .supported_versions
      .contains(&constant::DRAFT_11)
    {
      let mut m = context.client_manager.write().await;

      client = Arc::new(RwLock::new(MOQTClient::new(
        context.connection_id,
        Arc::new(RwLock::new(context.connection.clone())),
        Arc::new(client_setup),
      )));
      m.add(client.clone()).await;
    } else {
      warn!("unsupported version");
      return Err(anyhow::Error::msg(
        TerminationCode::VersionNegotiationFailed.to_json(),
      ));
    }

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
