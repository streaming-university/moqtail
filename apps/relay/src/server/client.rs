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
};
use tokio::sync::Notify;
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, error, info, warn};
use wtransport::{Connection, SendStream, error::StreamWriteError};

#[derive(Debug, Clone)]
pub(crate) struct MOQTClient {
  pub connection_id: usize,
  pub connection: Arc<Connection>,
  #[allow(dead_code)]
  pub client_setup: Arc<ClientSetup>,
  pub announced_track_namespaces: Arc<RwLock<Vec<Tuple>>>, // the track namespaces the publisher announced
  pub subscribers: Arc<RwLock<Vec<usize>>>, // the subscribers the client is subscribed to

  pub message_queue: Arc<RwLock<VecDeque<ControlMessage>>>, // the control messages the client has sent
  pub message_notify: Arc<Notify>, // notify when a new message is available
  pub send_streams: Arc<RwLock<HashMap<String, Arc<Mutex<SendStream>>>>>, // the streams the client has opened, key is the track alias + _ + subgroup_id

  //pub track_queue: Arc<RwLock<BTreeMap<u64>>>, // the track aliases that will be delivered to the client

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
    MOQTClient {
      connection_id,
      connection,
      client_setup,
      announced_track_namespaces: Arc::new(RwLock::new(Vec::new())),
      subscribers: Arc::new(RwLock::new(Vec::new())),
      message_queue: Arc::new(RwLock::new(VecDeque::new())),
      message_notify: Arc::new(Notify::default()),
      send_streams: Arc::new(RwLock::new(HashMap::new())),
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

  pub async fn open_stream(
    &self,
    stream_id: &str, // "subgroup" or "fetch"
    header_payload: Bytes,
    priority: i32, // Priority for the stream
  ) -> Result<Arc<Mutex<SendStream>>> {
    let mut send_streams = self.send_streams.write().await;
    match send_streams.entry(stream_id.to_string()) {
      std::collections::hash_map::Entry::Vacant(entry) => {
        let send_stream = self
          .connection
          .open_uni()
          .await
          .map_err(|e| anyhow::anyhow!("Failed to open send stream 1: {:?}", e))?
          .await
          .map_err(|e| anyhow::anyhow!("Failed to open send stream 2: {:?}", e))?;
        send_stream.set_priority(priority);
        entry.insert(Arc::new(Mutex::new(send_stream)));
        info!("open_stream | Create send_stream ({})", stream_id);
      }
      std::collections::hash_map::Entry::Occupied(_) => {
        debug!("open_stream | Send stream for {} already exists", stream_id);
      }
    }
    drop(send_streams);

    let send_streams = self.send_streams.read().await;

    // Retrieve the send stream from the map
    debug!("open_stream | Send stream for {}", stream_id);
    let send_stream = send_streams
      .get(&stream_id.to_string())
      .ok_or_else(|| anyhow::anyhow!("Send stream not found ({})", stream_id))
      .cloned()?;
    drop(send_streams);

    // Write the header payload to the stream
    match send_stream.lock().await.write_all(&header_payload).await {
      Ok(..) => {}
      Err(e) => {
        error!(
          "open_stream |  Failed to write header payload to send stream ({})",
          stream_id
        );

        // remove this from the streams
        let mut send_streams = self.send_streams.write().await;
        send_streams.remove(&stream_id.to_string());

        return Err(anyhow::anyhow!(
          "Failed to write header payload to send stream ({}): {:?}",
          stream_id,
          e
        ));
      }
    };

    Ok(send_stream.clone())
  }

  pub async fn close_stream(&self, stream_id: &str) -> Result<()> {
    let mut send_streams = self.send_streams.write().await;
    if let Some(send_stream) = send_streams.remove(stream_id) {
      let mut stream = send_stream.lock().await;
      stream.finish().await.map_err(|e| {
        error!(
          "close_stream | Failed to finish send stream ({}): {:?}",
          stream_id, e
        );
        anyhow::anyhow!("Failed to finish send stream ({}): {:?}", stream_id, e)
      })?;
      info!("close_stream | Closed send stream ({})", stream_id);
      Ok(())
    } else {
      warn!("close_stream | Send stream not found for {}", stream_id);
      Err(anyhow::anyhow!("Send stream not found ({})", stream_id))
    }
  }

  pub async fn write_object_to_stream(
    &self,
    stream_id: &str,
    object_id: u64,
    object: Bytes,
    the_stream: Option<Arc<Mutex<SendStream>>>,
  ) -> Result<(), anyhow::Error> {
    debug!(
      "write_object_to_stream | Writing object to stream ({} - {})",
      object_id, stream_id
    );

    let send_stream = {
      if let Some(send_stream) = the_stream {
        Some(send_stream)
      } else {
        let send_streams = self.send_streams.read().await;
        send_streams.get(&stream_id.to_string()).cloned()
      }
    };

    if let Some(s) = send_stream {
      let mut stream = s.lock().await;
      match stream.write_all(&object).await {
        Ok(..) => {}
        Err(e) => {
          match &e {
            StreamWriteError::Closed | StreamWriteError::Stopped(_) => {
              warn!(
                "write_object_to_stream | Send stream is closed or stopped ({})",
                stream_id
              );
              // remove this from the streams
              let mut send_streams = self.send_streams.write().await;
              send_streams.remove(&stream_id.to_string());
            }
            _ => {}
          }
        }
      };
      Ok(())
    } else {
      warn!(
        "write_object_to_stream | Send stream not found for {}",
        stream_id
      );
      // This is not an error. The stream already started, wait for the next group...
      // Err(anyhow::anyhow!("Send stream not found ({})", stream_id))
      Ok(())
    }
  }
}
