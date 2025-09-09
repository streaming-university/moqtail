use crate::server::stream_id::{StreamId, StreamType};
use anyhow::Result;
#[allow(dead_code)]
use bytes::Bytes;
use moqtail::{
  model::{
    common::tuple::Tuple,
    control::{client_setup::ClientSetup, control_message::ControlMessage},
  },
  transport::data_stream_handler::{FetchRequest, SubscribeRequest},
};

use std::{
  collections::{BTreeMap, HashMap, VecDeque},
  sync::Arc,
  usize,
};
use tokio::sync::Notify;
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, error, info, warn};
use wtransport::{Connection, SendStream, error::StreamWriteError};

// hash bucket count
pub const STREAM_BUCKET_COUNT: usize = 10;

pub type SendStreamMap = HashMap<String, Arc<Mutex<SendStream>>>;
pub type SendStreamLock = Arc<RwLock<SendStreamMap>>;
pub type SendStreamList = Vec<SendStreamLock>;

#[derive(Debug, Clone)]
pub(crate) struct MOQTClient {
  pub connection_id: usize,
  pub connection: Arc<Connection>,
  #[allow(dead_code)]
  pub client_setup: Arc<ClientSetup>,
  pub announced_track_namespaces: Arc<RwLock<Vec<Tuple>>>, // the track namespaces the publisher announced
  pub published_tracks: Arc<RwLock<Vec<u64>>>,             // the tracks the client is publishing
  pub subscribers: Arc<RwLock<Vec<usize>>>, // the subscribers the client is subscribed to

  pub message_queue: Arc<RwLock<VecDeque<ControlMessage>>>, // the control messages the client has sent
  pub message_notify: Arc<Notify>, // notify when a new message is available
  pub send_streams: Arc<SendStreamList>,

  // this contains the requests made by the client and the corresponding request
  pub fetch_requests: Arc<RwLock<BTreeMap<u64, FetchRequest>>>,

  // this contains the requests made by the client and the corresponding request.
  // The key value is the original request id.
  pub subscribe_requests: Arc<RwLock<BTreeMap<u64, SubscribeRequest>>>,
}

impl MOQTClient {
  pub(crate) fn new(
    connection_id: usize,
    connection: Arc<Connection>,
    client_setup: Arc<ClientSetup>,
  ) -> Self {
    let mut send_streams = Vec::with_capacity(STREAM_BUCKET_COUNT);
    for _ in 0..STREAM_BUCKET_COUNT {
      send_streams.push(Arc::new(RwLock::new(HashMap::new())));
    }

    MOQTClient {
      connection_id,
      connection,
      client_setup,
      announced_track_namespaces: Arc::new(RwLock::new(Vec::new())),
      published_tracks: Arc::new(RwLock::new(Vec::new())),
      subscribers: Arc::new(RwLock::new(Vec::new())),
      message_queue: Arc::new(RwLock::new(VecDeque::new())),
      message_notify: Arc::new(Notify::default()),
      send_streams: Arc::new(send_streams),
      fetch_requests: Arc::new(RwLock::new(BTreeMap::new())),
      subscribe_requests: Arc::new(RwLock::new(BTreeMap::new())),
    }
  }

  pub(crate) async fn add_announced_track_namespace(&self, track_namespace: Tuple) {
    let mut announced_track_namespaces = self.announced_track_namespaces.write().await;
    announced_track_namespaces.push(track_namespace);
  }

  pub(crate) async fn add_subscriber(&self, subscriber_id: usize) {
    let mut subscribers = self.subscribers.write().await;
    subscribers.push(subscriber_id);
  }

  pub(crate) async fn add_published_track(&self, track_alias: u64) {
    let mut published_tracks = self.published_tracks.write().await;
    published_tracks.push(track_alias);
  }

  pub(crate) async fn get_published_tracks(&self) -> Vec<u64> {
    let published_tracks = self.published_tracks.read().await;
    published_tracks.clone()
  }

  /// Get the next control message from the queue.
  /// This function will block until a message is available and will return the message.
  pub(crate) async fn wait_for_next_message(&self) -> ControlMessage {
    loop {
      // Acquire the lock and check if there's a message
      let mut message_queue = self.message_queue.write().await;
      if let Some(message) = message_queue.pop_front() {
        return message;
      }
      // Drop the lock before waiting
      drop(message_queue);
      // TODO: what happens when the client disconnects?
      self.message_notify.notified().await;
    }
  }

  // Also, update queue_message to notify:
  pub(crate) async fn queue_message(&self, control_message: ControlMessage) {
    let mut message_queue = self.message_queue.write().await;
    message_queue.push_back(control_message);
    self.message_notify.notify_one();
  }

  fn get_stream_map(
    &self,
    stream_id: &StreamId,
  ) -> Arc<RwLock<HashMap<String, Arc<Mutex<SendStream>>>>> {
    let partition_index = match stream_id.stream_type {
      StreamType::Fetch => stream_id.fetch_request_id.unwrap() % STREAM_BUCKET_COUNT as u64,
      StreamType::Subgroup => {
        (stream_id
          .track_alias
          .checked_mul(stream_id.group_id.unwrap_or(1))
          .unwrap_or(0))
          % STREAM_BUCKET_COUNT as u64
      }
    } as usize;
    debug!(
      "get_stream_map | stream_id: {} partition_index: {}",
      stream_id, partition_index
    );
    self.send_streams[partition_index].clone()
  }

  pub async fn get_stream(&self, stream_id: &StreamId) -> Option<Arc<Mutex<SendStream>>> {
    let send_stream_map = self.get_stream_map(stream_id);
    let send_streams = send_stream_map.read().await;
    let send_stream = send_streams.get(stream_id.get_stream_id().as_str());
    send_stream.cloned()
  }

  pub async fn open_stream(
    &self,
    stream_id: &StreamId,
    header_payload: Bytes,
    _priority: i32, // Priority for the stream
  ) -> Result<Arc<Mutex<SendStream>>> {
    let send_stream = {
      let send_stream_map = self.get_stream_map(stream_id);
      let mut send_streams = send_stream_map.write().await;
      match send_streams.entry(stream_id.get_stream_id().to_string()) {
        std::collections::hash_map::Entry::Vacant(entry) => {
          let result = self
            .connection
            .open_uni()
            .await
            .map_err(|e| anyhow::anyhow!("Failed to open send stream 1: {:?}", e))?;

          let send_stream = result
            .await
            .map_err(|e| anyhow::anyhow!("Failed to open send stream 2: {:?}", e))?;

          // TODO: just relay everything without setting any priority here. Need to check later
          // send_stream.set_priority(priority);
          send_stream.set_priority(0);
          let s = Arc::new(Mutex::new(send_stream));
          entry.insert(s.clone());
          info!(
            "open_stream | added send_stream to send streams ({}) connection_id: {}",
            stream_id, self.connection_id
          );
          s
        }
        std::collections::hash_map::Entry::Occupied(s) => {
          debug!(
            "open_stream | Send stream for {} already exists connection_id: {}",
            stream_id, self.connection_id
          );
          s.get().clone()
        }
      }
    };

    debug!(
      "open_stream |  writing to stream ({}) connection_id: {}",
      stream_id, self.connection_id
    );

    // Write the header payload to the stream
    match send_stream.lock().await.write_all(&header_payload).await {
      Ok(..) => {
        debug!(
          "open_stream |  wrote to stream ({}) connection_id: {}",
          stream_id, self.connection_id
        );
      }
      Err(e) => {
        error!(
          "open_stream |  Failed to write header payload to send stream ({}) connection_id: {}",
          stream_id, self.connection_id
        );

        // remove this from the streams
        let send_stream_map = self.get_stream_map(stream_id);
        let mut send_streams = send_stream_map.write().await;
        send_streams.remove(&stream_id.get_stream_id().to_string());

        return Err(anyhow::anyhow!(
          "Failed to write header payload to send stream ({}): {:?} connection_id: {}",
          stream_id,
          self.connection_id,
          e
        ));
      }
    };

    Ok(send_stream.clone())
  }

  // Remove the stream from the map and finish it
  pub async fn close_stream(&self, stream_id: &StreamId) -> Result<()> {
    let stream = self.remove_stream_by_stream_id(stream_id).await;

    if let Some(send_stream) = stream {
      // gracefully close the stream
      self.finish_stream(stream_id, send_stream).await
    } else {
      warn!(
        "close_stream | Send stream not found for {} connection_id: {}",
        stream_id, self.connection_id
      );
      Err(anyhow::anyhow!(
        "Send stream not found ({}) connection_id: {}",
        stream_id,
        self.connection_id
      ))
    }
  }

  // Just remove the stream from the stream_map
  // The caller finishes the stream and calls this to remove it from the map
  pub async fn remove_stream_by_stream_id(
    &self,
    stream_id: &StreamId,
  ) -> Option<Arc<Mutex<SendStream>>> {
    let send_stream_map = self.get_stream_map(stream_id);
    let mut send_streams = send_stream_map.write().await;
    send_streams.remove(stream_id.get_stream_id().as_str())
  }

  async fn finish_stream(
    &self,
    stream_id: &StreamId,
    send_stream: Arc<Mutex<SendStream>>,
  ) -> Result<()> {
    let mut stream = send_stream.lock().await;

    // gracefully close the stream
    stream.finish().await.map_err(|e| {
      error!(
        "close_stream | Failed to finish send stream ({}): {:?} connection_id: {}",
        stream_id, e, self.connection_id
      );
      anyhow::anyhow!("Failed to finish send stream ({}): {:?}", stream_id, e)
    })?;
    info!(
      "close_stream | Closed send stream ({}) connection_id: {}",
      stream_id, self.connection_id
    );
    Ok(())
  }

  pub async fn write_object_to_stream(
    &self,
    stream_id: &StreamId,
    object_id: u64,
    object: Bytes,
    the_stream: Option<Arc<Mutex<SendStream>>>,
  ) -> Result<(), anyhow::Error> {
    debug!(
      "write_object_to_stream | Writing object to stream ({} - {}) connection_id: {}",
      object_id, stream_id, self.connection_id
    );

    let send_stream = {
      if let Some(send_stream) = the_stream {
        Some(send_stream)
      } else {
        let stream_map = self.get_stream_map(stream_id);
        let send_streams = stream_map.read().await;
        send_streams
          .get(stream_id.get_stream_id().as_str())
          .cloned()
      }
    };

    // flow control

    if let Some(s) = send_stream {
      let mut stream = s.lock().await;
      match stream.write_all(&object).await {
        Ok(..) => {}
        Err(e) => {
          match &e {
            StreamWriteError::Closed | StreamWriteError::Stopped(_) => {
              warn!(
                "write_object_to_stream | Send stream is closed or stopped ({})",
                stream_id.get_stream_id()
              );
              drop(stream);
              // remove this from the streams
              let stream_map = self.get_stream_map(stream_id);
              let mut send_streams = stream_map.write().await;
              send_streams.remove(stream_id.get_stream_id().as_str());
            }
            _ => {}
          }
        }
      };
      Ok(())
    } else {
      warn!(
        "write_object_to_stream | Send stream not found for {} connection_id: {}",
        stream_id, self.connection_id
      );
      // This is not an error. The stream already started, wait for the next group...
      // Err(anyhow::anyhow!("Send stream not found ({})", stream_id))
      Ok(())
    }
  }
}
