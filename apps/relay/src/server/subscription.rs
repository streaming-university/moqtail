use std::sync::Arc;

use crate::server::client::MOQTClient;
use crate::server::track::TrackEvent;
use crate::server::track_cache::TrackCache;
use crate::server::utils;
use anyhow::Result;
use bytes::Bytes;
use moqtail::model::common::reason_phrase::ReasonPhrase;
use moqtail::model::control::constant::SubscribeDoneStatusCode;
use moqtail::model::control::control_message::ControlMessage;
use moqtail::model::control::subscribe::Subscribe;
use moqtail::model::control::subscribe_done::SubscribeDone;
use moqtail::model::data::object::Object;
use moqtail::transport::data_stream_handler::HeaderInfo;
use std::collections::BTreeMap;
use std::time::Instant;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tokio::sync::RwLock;
use tokio::sync::mpsc::UnboundedReceiver;
use tracing::{debug, error, info};
use wtransport::SendStream;

#[derive(Debug, Clone)]
pub struct Subscription {
  pub subscribe_message: Subscribe,
  subscriber: Arc<RwLock<MOQTClient>>,
  event_rx: Arc<Mutex<Option<UnboundedReceiver<Vec<TrackEvent>>>>>,
  send_streams: Arc<RwLock<BTreeMap<String, Arc<Mutex<SendStream>>>>>,
  finished: Arc<RwLock<bool>>, // Indicates if the subscription is finished
  #[allow(dead_code)]
  cache: TrackCache,
  client_connection_id: usize,
}

impl Subscription {
  fn create_instance(
    subscribe_message: Subscribe,
    subscriber: Arc<RwLock<MOQTClient>>,
    event_rx: Arc<Mutex<Option<UnboundedReceiver<Vec<TrackEvent>>>>>,
    cache: TrackCache,
    client_connection_id: usize,
  ) -> Self {
    Self {
      subscribe_message,
      subscriber,
      event_rx,
      send_streams: Arc::new(RwLock::new(BTreeMap::new())),
      finished: Arc::new(RwLock::new(false)),
      cache,
      client_connection_id,
    }
  }
  pub fn new(
    subscribe_message: Subscribe,
    subscriber: Arc<RwLock<MOQTClient>>,
    event_rx: UnboundedReceiver<Vec<TrackEvent>>,
    cache: TrackCache,
    client_connection_id: usize,
  ) -> Self {
    let event_rx = Arc::new(Mutex::new(Some(event_rx)));
    let sub = Self::create_instance(
      subscribe_message,
      subscriber,
      event_rx,
      cache,
      client_connection_id,
    );

    let mut instance = sub.clone();
    tokio::spawn(async move {
      loop {
        let is_finished = instance.finished.read().await;
        if *is_finished {
          break;
        }
        drop(is_finished); // Explicitly drop the lock to allow other tasks to proceed
        tokio::select! {
          biased;
          _ = instance.receive() => {
            continue;
          }
          // 1 second timeout to check if the subscription is still valid
          _ = tokio::time::sleep(tokio::time::Duration::from_secs(1)) => {
            // TODO: implement max timeout here
            continue;
          }
        }
      }
    });

    sub
  }

  pub async fn finish(&mut self) {
    let mut is_finished = self.finished.write().await;
    *is_finished = true;
    drop(is_finished); // Explicitly drop the lock to allow other tasks to proceed

    let mut receiver_guard = self.event_rx.lock().await;
    let _ = receiver_guard.take(); // This replaces the Some(receiver) with None

    info!(
      "Subscription finished for subscriber: {} and track: {}",
      self.client_connection_id, self.subscribe_message.track_alias
    );

    // Close all send streams
    let mut send_streams = self.send_streams.write().await;
    for (stream_id, send_stream) in send_streams.iter_mut() {
      if let Err(e) = send_stream.lock().await.shutdown().await {
        if e.kind() == std::io::ErrorKind::NotConnected {
          debug!(
            "Stream {} for subscriber: {} is already closed",
            stream_id, self.client_connection_id
          );
        } else {
          error!(
            "Failed to shutdown stream {} for subscriber: {}, error: {:?}",
            stream_id, self.client_connection_id, e
          );
        }
      }
    }
  }

  async fn receive(&mut self) {
    let mut event_rx_guard = self.event_rx.lock().await;

    if let Some(ref mut event_rx) = *event_rx_guard {
      match event_rx.recv().await {
        Some(events) => {
          // Process all events in the array
          for event in events {
            if *self.finished.read().await {
              return;
            }

            match event {
              TrackEvent::Header { header } => {
                info!(
                  "Received Header event: subscriber: {}",
                  self.client_connection_id
                );

                if let HeaderInfo::Subgroup {
                  header: _subgroup_header,
                } = header
                {
                  if let Ok((stream_id, send_stream)) = self.handle_header(header.clone()).await {
                    self
                      .send_streams
                      .write()
                      .await
                      .insert(stream_id.clone(), send_stream.clone());
                  }
                } else {
                  error!(
                    "Received Header event for non-subgroup header: {:?}",
                    header
                  );
                }
              }
              TrackEvent::Object { object, stream_id } => {
                let send_stream = self.send_streams.read().await.get(&stream_id).cloned();

                if let Some(send_stream) = send_stream {
                  debug!(
                    "Received Object event: subscriber: {} stream_id: {} track: {}",
                    self.client_connection_id, stream_id, self.subscribe_message.track_alias
                  );
                  let _ = self
                    .handle_object(object, stream_id, send_stream.clone())
                    .await;
                } else {
                  error!(
                    "Received Object event without a valid send stream for subscriber: {} stream_id: {} track: {}",
                    self.client_connection_id, stream_id, self.subscribe_message.track_alias
                  );
                }
              }
              TrackEvent::StreamClosed { stream_id } => {
                info!(
                  "Received StreamClosed event: subscriber: {} stream_id: {} track: {}",
                  self.client_connection_id, stream_id, self.subscribe_message.track_alias
                );
                let _ = self.handle_stream_closed(stream_id).await;
              }
              TrackEvent::PublisherDisconnected { reason } => {
                info!(
                  "Received PublisherDisconnected event: subscriber: {}, reason: {} track: {}",
                  self.client_connection_id, reason, self.subscribe_message.track_alias
                );

                // Send SubscribeDone message and finish the subscription
                if let Err(e) = self
                  .send_subscribe_done(SubscribeDoneStatusCode::TrackEnded, &reason)
                  .await
                {
                  error!(
                    "Failed to send SubscribeDone for publisher disconnect: subscriber: {} track: {} error: {:?}",
                    self.client_connection_id, self.subscribe_message.track_alias, e
                  );
                }

                // Finish the subscription since the publisher is gone
                let mut is_finished = self.finished.write().await;
                *is_finished = true;
                return; // Exit early since subscription is finished
              }
            }
          }
        }
        None => {
          // For unbounded receivers, recv() returns None when the channel is closed
          // The channel is closed, we should finish the subscription
          info!(
            "Event receiver closed for subscriber: {} track: {}, finishing subscription",
            self.client_connection_id, self.subscribe_message.track_alias
          );
          let mut is_finished = self.finished.write().await;
          *is_finished = true;
        }
      }
    } else {
      // No receiver available, subscription has been finished
      let mut is_finished = self.finished.write().await;
      *is_finished = true;
    }
  }

  async fn handle_header(
    &self,
    header_info: HeaderInfo,
  ) -> Result<(String, Arc<Mutex<SendStream>>)> {
    // Handle the header information
    debug!("Handling header: {:?}", header_info);
    let stream_id = self.get_stream_id(&header_info);

    if let Ok(header_payload) = self.get_header_payload(&header_info).await {
      // set priority based on the current time
      // TODO: revisit this logic to set priority based on the subscription
      let priority = i32::MAX
        - (Instant::now().duration_since(*utils::BASE_TIME).as_millis() % i32::MAX as u128) as i32;

      let send_stream = match self
        .subscriber
        .read()
        .await
        .open_stream(stream_id.as_str(), header_payload, priority)
        .await
      {
        Ok(send_stream) => send_stream,
        Err(e) => {
          error!(
            "Failed to open stream {}: {:?} subscriber: {} track: {}",
            stream_id, e, self.client_connection_id, self.subscribe_message.track_alias
          );
          return Err(e);
        }
      };
      Ok((stream_id, send_stream))
    } else {
      error!(
        "Failed to serialize header payload for stream {} subscriber: {} track: {}",
        stream_id, self.client_connection_id, self.subscribe_message.track_alias
      );
      Err(anyhow::anyhow!(
        "Failed to serialize header payload for stream {} subscriber: {} track: {}",
        stream_id,
        self.client_connection_id,
        self.subscribe_message.track_alias
      ))
    }
  }

  async fn handle_object(
    &self,
    object: Object,
    stream_id: String,
    send_stream: Arc<Mutex<SendStream>>,
  ) -> Result<()> {
    debug!(
      "Handling object track: {} location: {:?} stream_id: {} diff_ms: {}",
      object.track_alias,
      object.location,
      &stream_id,
      (Instant::now() - *utils::BASE_TIME).as_millis()
    );

    // This loop will keep the stream open and process incoming objects
    // TODO: revisit this logic to handle also fetch requests
    if let Ok(sub_object) = object.try_into_subgroup() {
      let has_extensions = sub_object.extension_headers.is_some();
      let object_bytes = match sub_object.serialize(has_extensions) {
        Ok(data) => data,
        Err(e) => {
          error!(
            "Error in serializing object before writing to stream for subscriber {} track: {}, error: {:?}",
            self.client_connection_id, self.subscribe_message.track_alias, e
          );
          return Err(e.into());
        }
      };

      self
        .subscriber
        .read()
        .await
        .write_object_to_stream(
          stream_id.as_str(),
          sub_object.object_id,
          object_bytes,
          Some(send_stream.clone()),
        )
        .await
        .map_err(|open_stream_err| {
          error!(
            "Error writing object to stream for subscriber {} track: {}, error: {:?}",
            self.client_connection_id, self.subscribe_message.track_alias, open_stream_err
          );
          open_stream_err
        })
    } else {
      debug!(
        "Could not convert object to subgroup. stream_id: {:?} subscriber: {} track: {}",
        stream_id, self.client_connection_id, self.subscribe_message.track_alias
      );
      Err(anyhow::anyhow!(
        "Could not convert object to subgroup. stream_id: {:?} subscriber: {} track: {}",
        stream_id,
        self.client_connection_id,
        self.subscribe_message.track_alias
      ))
    }
  }

  async fn handle_stream_closed(&self, stream_id: String) -> Result<()> {
    // Handle the stream closed event
    debug!("Stream closed: {}", stream_id);
    let connection_id = self.client_connection_id;
    self
      .subscriber
      .read()
      .await
      .close_stream(&stream_id)
      .await
      .map_err(|e| {
        debug!(
          "Failed to close stream {}: {:?} subscriber: {} track: {}",
          stream_id, e, connection_id, self.subscribe_message.track_alias
        );
        e
      })
  }

  async fn get_header_payload(&self, header_info: &HeaderInfo) -> Result<Bytes> {
    let connection_id = self.client_connection_id;
    match header_info {
      HeaderInfo::Subgroup { header } => header.serialize().map_err(|e| {
        error!(
          "Error serializing subgroup header: {:?} subscriber: {} track: {}",
          e, connection_id, self.subscribe_message.track_alias
        );
        e.into()
      }),
      HeaderInfo::Fetch {
        header,
        fetch_request: _,
      } => header.serialize().map_err(|e| {
        error!(
          "Error serializing fetch header: {:?} subscriber: {} track: {}",
          e, connection_id, self.subscribe_message.track_alias
        );
        e.into()
      }),
    }
  }

  fn get_stream_id(&self, header_info: &HeaderInfo) -> String {
    utils::build_stream_id(self.subscribe_message.track_alias, header_info)
  }

  /// Send SubscribeDone message to this subscriber
  pub async fn send_subscribe_done(
    &self,
    status_code: SubscribeDoneStatusCode,
    reason: &str,
  ) -> Result<(), anyhow::Error> {
    let reason_phrase = ReasonPhrase::try_new(reason.to_string())
      .map_err(|e| anyhow::anyhow!("Failed to create reason phrase: {:?}", e))?;

    let subscribe_done = SubscribeDone::new(
      self.subscribe_message.request_id,
      status_code,
      0, // stream_count - set to 0 as track is ending
      reason_phrase,
    );

    let subscriber_client = self.subscriber.read().await;
    subscriber_client
      .queue_message(ControlMessage::SubscribeDone(Box::new(subscribe_done)))
      .await;

    info!(
      "Sent SubscribeDone to subscriber {} track: {} for request_id {}",
      self.client_connection_id,
      self.subscribe_message.track_alias,
      self.subscribe_message.request_id
    );

    Ok(())
  }
}
