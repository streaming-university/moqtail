use std::sync::Arc;

use crate::server::client::MOQTClient;
use crate::server::track::TrackEvent;
use crate::server::track_cache::TrackCache;
use crate::server::utils;
use anyhow::Result;
use bytes::Bytes;
use moqtail::model::control::subscribe::Subscribe;
use moqtail::model::data::object::Object;
use moqtail::transport::data_stream_handler::HeaderInfo;
use std::collections::BTreeMap;
use std::time::Instant;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tokio::sync::RwLock;
use tokio::sync::broadcast::Receiver;
use tokio::sync::broadcast::error::RecvError;
use tracing::{debug, error, info};
use wtransport::SendStream;

#[derive(Debug, Clone)]
pub struct Subscription {
  pub subscribe_message: Subscribe,
  pub created_at: Instant,

  subscriber: Arc<RwLock<MOQTClient>>,
  event_rx: Arc<Mutex<Option<Receiver<TrackEvent>>>>,
  send_streams: Arc<RwLock<BTreeMap<String, Arc<Mutex<SendStream>>>>>,
  finished: Arc<RwLock<bool>>, // Indicates if the subscription is finished
  cache: TrackCache,
}

impl Subscription {
  fn create_instance(
    subscribe_message: Subscribe,
    subscriber: Arc<RwLock<MOQTClient>>,
    event_rx: Arc<Mutex<Option<Receiver<TrackEvent>>>>,
    cache: TrackCache,
  ) -> Self {
    Self {
      subscribe_message,
      created_at: Instant::now(),
      subscriber,
      event_rx,
      send_streams: Arc::new(RwLock::new(BTreeMap::new())),
      finished: Arc::new(RwLock::new(false)),
      cache,
    }
  }
  pub fn new(
    subscribe_message: Subscribe,
    subscriber: Arc<RwLock<MOQTClient>>,
    event_rx: Receiver<TrackEvent>,
    cache: TrackCache,
  ) -> Self {
    let event_rx = Arc::new(Mutex::new(Some(event_rx)));
    let sub = Self::create_instance(subscribe_message, subscriber, event_rx, cache);

    let mut instance = sub.clone();
    tokio::spawn(async move {
      loop {
        let is_finished = instance.finished.read().await;
        if *is_finished {
          info!(
            "Subscription finished for subscriber: {:?} and track: {}",
            instance.connection_id().await,
            instance.subscribe_message.track_alias
          );
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
      "Finishing subscription for subscriber: {:?}",
      self.connection_id().await
    );
    // Close all send streams
    let mut send_streams = self.send_streams.write().await;
    for (stream_id, send_stream) in send_streams.iter_mut() {
      if let Err(e) = send_stream.lock().await.shutdown().await {
        if e.kind() == std::io::ErrorKind::NotConnected {
          debug!(
            "Stream {} for subscriber: {:?} is already closed",
            stream_id,
            self.connection_id().await
          );
        } else {
          error!(
            "Failed to shutdown stream {} for subscriber: {:?}, error: {:?}",
            stream_id,
            self.connection_id().await,
            e
          );
        }
      }
    }
  }

  async fn receive(&mut self) {
    let mut event_rx_guard = self.event_rx.lock().await;

    if let Some(ref mut event_rx) = *event_rx_guard {
      match event_rx.recv().await {
        Ok(event) => match event {
          TrackEvent::Header { header } => {
            info!("Received Header event: {:?}", self.connection_id().await);
            if *self.finished.read().await {
              return;
            }

            if let Ok((stream_id, send_stream)) = self.handle_header(header.clone()).await {
              self
                .send_streams
                .write()
                .await
                .insert(stream_id.clone(), send_stream.clone());
            }
          }
          TrackEvent::Object { object, header_id } => {
            if *self.finished.read().await {
              return;
            }
            let send_stream = self.send_streams.read().await.get(&header_id).cloned();
            /*
            if send_stream.is_none() {
              // If the send stream is not found, try to get it from the headers
              debug!(
                "*** Received Object event without a send stream for subscriber: {:?}, header_id: {}",
                self.connection_id().await, header_id
              );
              if let Some(header_info) = self.cache.get_header(&header_id).await {
                debug!(
                  "*** Trying to handle header for Object event: {:?}",
                  header_info
                );
                if let Ok((stream_id, ss)) = self.handle_header(header_info.clone()).await {
                  debug!(
                    "*** Created new send stream for Object event: stream_id: {}",
                    stream_id
                  );
                  send_stream = Some(ss.clone());
                  self
                    .send_streams
                    .write()
                    .await
                    .insert(stream_id.clone(), ss.clone());
                }
              }
            }
            */

            if let Some(send_stream) = send_stream {
              debug!(
                "Received Object event: cid: {:?} sid: {}",
                self.connection_id().await,
                header_id
              );
              let _ = self
                .handle_object(object, header_id, send_stream.clone())
                .await;
            } else {
              error!(
                "Received Object event without a valid send stream for subscriber: {:?} stream_id: {}",
                self.connection_id().await,
                header_id
              );
            }
          }
          TrackEvent::StreamClosed { stream_id } => {
            info!(
              "Received StreamClosed event: cid: {:?} stream_id: {}",
              self.connection_id().await,
              stream_id
            );
            let _ = self.handle_stream_closed(stream_id).await;
          }
        },
        Err(e) => {
          // TODO: Why does this happen?
          if e == RecvError::Closed {
            // The channel is closed, we should finish the subscription
            info!(
              "Event receiver closed for subscriber: {:?}, finishing subscription",
              self.connection_id().await
            );
            let mut is_finished = self.finished.write().await;
            *is_finished = true;
          } else {
            error!("Unexpected error receiving event: {:?}", e);
          }
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

    if let Ok(header_payload) = self.get_header_payload(&header_info) {
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
          error!("Failed to open stream {}: {:?}", stream_id, e);
          return Err(e);
        }
      };
      Ok((stream_id, send_stream))
    } else {
      error!(
        "Failed to serialize header payload for stream {}",
        stream_id
      );
      Err(anyhow::anyhow!(
        "Failed to serialize header payload for stream {}",
        stream_id
      ))
    }
  }

  async fn handle_object(
    &self,
    object: Object,
    stream_id: String,
    send_stream: Arc<Mutex<SendStream>>,
  ) -> Result<()> {
    // Handle the object information
    // debug!("Handling object: {:?} stream_id: {} diff_ms: {}", object, &stream_id, (Instant::now() - self.created_at).as_millis());
    info!(
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
            "Error in serializing object before writing to stream for subscriber {}, error: {:?}",
            self.connection_id().await,
            e
          );
          return Err(e.into());
        }
      };
      let connection_id = self.connection_id().await;
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
            "Error writing object to stream for subscriber {}, error: {:?}",
            connection_id, open_stream_err
          );
          open_stream_err
        })
    } else {
      debug!(
        "Could not convert object to subgroup. stream_id: {:?}",
        stream_id
      );
      Err(anyhow::anyhow!(
        "Could not convert object to subgroup. stream_id: {:?}",
        stream_id
      ))
    }
  }

  async fn handle_stream_closed(&self, stream_id: String) -> Result<()> {
    // Handle the stream closed event
    debug!("Stream closed: {}", stream_id);
    self
      .subscriber
      .read()
      .await
      .close_stream(&stream_id)
      .await
      .map_err(|e| {
        debug!("Failed to close stream {}: {:?}", stream_id, e);
        e
      })
  }

  fn get_header_payload(&self, header_info: &HeaderInfo) -> Result<Bytes> {
    match header_info {
      HeaderInfo::Subgroup { header } => header.serialize().map_err(|e| {
        error!("Error serializing subgroup header: {:?}", e);
        e.into()
      }),
      HeaderInfo::Fetch {
        header,
        fetch_request: _,
      } => header.serialize().map_err(|e| {
        error!("Error serializing fetch header: {:?}", e);
        e.into()
      }),
    }
  }

  fn get_stream_id(&self, header_info: &HeaderInfo) -> String {
    utils::build_header_id(header_info)
  }

  async fn connection_id(&self) -> usize {
    self.subscriber.read().await.connection_id
  }
}
