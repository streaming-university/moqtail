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
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, error, info, warn};
use wtransport::{Connection, SendStream};

#[derive(Debug, Clone)]
pub(crate) struct MOQTClient {
  pub connection_id: usize,
  pub connection: Arc<RwLock<Connection>>,
  #[allow(dead_code)]
  pub client_setup: Arc<ClientSetup>,
  pub announced_track_namespaces: Arc<RwLock<Vec<Tuple>>>, // the track namespaces the publisher announced
  pub subscribers: Arc<RwLock<Vec<usize>>>, // the subscribers the client is subscribed to
  #[allow(dead_code)]
  pub publishers: Arc<RwLock<Vec<usize>>>, // the publishers the subscriber is subscribed to

  pub message_queue: Arc<RwLock<VecDeque<ControlMessage>>>, // the control messages the client has sent

  #[allow(dead_code)]
  pub subgroup_object_queue: Arc<RwLock<HashMap<String, RwLock<VecDeque<Bytes>>>>>, // the objects that will be delivered to the client (very basic implementation :))

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
    connection: Arc<RwLock<Connection>>,
    client_setup: Arc<ClientSetup>,
  ) -> Self {
    MOQTClient {
      connection_id,
      connection,
      client_setup,
      announced_track_namespaces: Arc::new(RwLock::new(Vec::new())),
      subscribers: Arc::new(RwLock::new(Vec::new())),
      publishers: Arc::new(RwLock::new(Vec::new())),
      message_queue: Arc::new(RwLock::new(VecDeque::new())),
      subgroup_object_queue: Arc::new(RwLock::new(HashMap::new())),
      send_streams: Arc::new(RwLock::new(HashMap::new())),
      fetch_requests: Arc::new(RwLock::new(BTreeMap::new())),
      subscribe_requests: Arc::new(RwLock::new(BTreeMap::new())),
    }
  }

  pub(crate) async fn queue_message(&self, control_message: ControlMessage) {
    let mut message_queue = self.message_queue.write().await;
    message_queue.push_back(control_message);
  }

  #[allow(dead_code)]
  pub(crate) async fn queue_subgroup_object(
    &mut self,
    track_alias: u64,
    subgroup_id: u64,
    object: Bytes,
  ) {
    let mut subgroup_object_queue = self.subgroup_object_queue.write().await;
    let key = format!("{track_alias}_{subgroup_id}");
    let queue = subgroup_object_queue
      .entry(key)
      .or_insert_with(|| RwLock::new(VecDeque::new()));
    let mut queue = queue.write().await;
    queue.push_back(object);
  }

  #[allow(dead_code)]
  pub(crate) async fn get_next_subgroup_object(
    &mut self,
    track_alias: u64,
    subgroup_id: u64,
  ) -> Option<Bytes> {
    let subgroup_object_queue = self.subgroup_object_queue.read().await;
    let key = format!("{track_alias}_{subgroup_id}");
    if let Some(queue) = subgroup_object_queue.get(&key) {
      let mut queue = queue.write().await;
      queue.pop_front()
    } else {
      None
    }
  }

  #[allow(dead_code)]
  pub(crate) async fn get_next_message(&mut self) -> Option<ControlMessage> {
    let mut message_queue = self.message_queue.write().await;
    message_queue.pop_front()
  }

  pub(crate) async fn add_announced_track_namespace(&mut self, track_namespace: Tuple) {
    let mut announced_track_namespaces = self.announced_track_namespaces.write().await;
    announced_track_namespaces.push(track_namespace);
  }

  #[allow(dead_code)]
  pub(crate) async fn remove_announced_track_namespace(&mut self, track_namespace: &Tuple) {
    let mut announced_track_namespaces = self.announced_track_namespaces.write().await;
    announced_track_namespaces.retain(|x| x != track_namespace);
  }

  pub(crate) async fn add_subscriber(&self, subscriber_id: usize) {
    let mut subscribers = self.subscribers.write().await;
    subscribers.push(subscriber_id);
  }

  #[allow(dead_code)]
  pub(crate) async fn remove_subscriber(&mut self, subscriber_id: usize) {
    let mut subscribers = self.subscribers.write().await;
    subscribers.retain(|&x| x != subscriber_id);
  }

  #[allow(dead_code)]
  pub(crate) async fn add_publisher(&mut self, publisher_id: usize) {
    let mut publishers = self.publishers.write().await;
    publishers.push(publisher_id);
  }

  #[allow(dead_code)]
  pub(crate) async fn remove_publisher(&mut self, publisher_id: usize) {
    let mut publishers = self.publishers.write().await;
    publishers.retain(|&x| x != publisher_id);
  }

  /// Get the next control message from the queue
  /// This function will block until a message is available
  /// and will return the message.
  pub(crate) async fn wait_for_next_message(&self) -> ControlMessage {
    loop {
      let mut message_queue = self.message_queue.write().await;

      if message_queue.is_empty() {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        continue;
      } else {
        let message = message_queue.pop_front().unwrap();
        return message;
      }
    }
  }

  pub async fn open_stream(
    &self,
    stream_id: &str, // "subgroup" or "fetch"
    header_payload: Bytes,
  ) -> Result<Arc<Mutex<SendStream>>, anyhow::Error> {
    let mut send_streams = self.send_streams.write().await;
    match send_streams.entry(stream_id.to_string()) {
      std::collections::hash_map::Entry::Vacant(entry) => {
        let send_stream = self
          .connection
          .read()
          .await
          .open_uni()
          .await
          .map_err(|e| anyhow::anyhow!("Failed to open send stream 1: {:?}", e))?
          .await
          .map_err(|e| anyhow::anyhow!("Failed to open send stream 2: {:?}", e))?;
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
      .expect("Send stream not found")
      .clone();
    // Write the header payload to the stream
    send_stream
      .lock()
      .await
      .write_all(&header_payload)
      .await
      .map_err(|e| {
        error!(
          "open_stream |  Failed to write header payload to send stream ({}), {:?}",
          stream_id, e
        );
        anyhow::anyhow!(
          "Failed to write header payload to send stream ({}): {:?}",
          stream_id,
          e
        )
      })?;
    Ok(send_stream.clone())
  }

  pub async fn close_stream(&self, stream_id: &str) -> Result<(), anyhow::Error> {
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
    let send_streams = self.send_streams.read().await;

    if let Some(send_stream) = the_stream {
      let mut stream = send_stream.lock().await;
      stream.write_all(&object).await?;
      Ok(())
    } else if let Some(send_stream) = send_streams.get(&stream_id.to_string()).cloned() {
      let mut stream = send_stream.lock().await;
      stream.write_all(&object).await?;
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
