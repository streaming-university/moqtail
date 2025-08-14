use crate::server::utils;
use moqtail::model::common::location::Location;
use moqtail::model::data::fetch_object::FetchObject;
use moqtail::transport::data_stream_handler::HeaderInfo;
use std::{
  collections::{BTreeMap, VecDeque},
  sync::Arc,
};
use tokio::sync::{
  RwLock,
  mpsc::{Receiver, channel},
};
use tracing::{debug, info, warn};

#[derive(Debug, Clone)]
pub struct TrackCache {
  #[allow(dead_code)]
  pub track_alias: u64,
  headers: Arc<RwLock<BTreeMap<String, HeaderInfo>>>,
  #[allow(dead_code)]
  objects: Arc<RwLock<BTreeMap<u64, Vec<FetchObject>>>>,
  // Ring buffer implementation: keep track of header IDs in order of insertion
  header_queue: Arc<RwLock<VecDeque<String>>>,
  #[allow(dead_code)]
  cache_size: usize,
}

impl TrackCache {
  pub fn new(track_alias: u64, cache_size: usize) -> Self {
    Self {
      track_alias,
      headers: Arc::new(RwLock::new(BTreeMap::new())),
      objects: Arc::new(RwLock::new(BTreeMap::new())),
      header_queue: Arc::new(RwLock::new(VecDeque::with_capacity(cache_size))),
      cache_size,
    }
  }

  #[allow(dead_code)]
  pub async fn add_header(&self, header: HeaderInfo) -> Option<HeaderInfo> {
    let stream_id = utils::build_stream_id(self.track_alias, &header);

    debug!(
      "add_header | track: {} stream_id: {}",
      self.track_alias, stream_id
    );

    // Check if we need to evict the oldest header
    // self.ensure_capacity(&header_id).await;

    // Add new header to queue
    let mut header_queue = self.header_queue.write().await;
    header_queue.push_back(stream_id.clone());

    // Store the header
    let mut headers = self.headers.write().await;
    headers.insert(stream_id, header)
  }

  /*
  // Ensure we don't exceed capacity by removing oldest elements if needed
  async fn ensure_capacity(&self, new_header_id: &String) {
    let mut header_queue = self.header_queue.write().await;

    // If the header already exists, we're just updating it
    if self.headers.read().await.contains_key(new_header_id) {
      // Remove the existing entry from the queue
      if let Some(pos) = header_queue.iter().position(|id| id == new_header_id) {
        header_queue.remove(pos);
      }
      return;
    }

    // If we're at capacity, remove the oldest header and its objects
    if header_queue.len() >= self.cache_size {
      if let Some(oldest_header_id) = header_queue.pop_front() {
        debug!(
          "ensure_capacity | removing oldest header. track: {} header: {}",
          self.track_alias, oldest_header_id
        );
        // Remove header
        let mut headers = self.headers.write().await;
        headers.remove(&oldest_header_id);

        // Remove associated objects
        let mut objects = self.objects.write().await;
        objects.remove(&oldest_header_id);
      }
    }
  }
  */

  pub async fn add_object(&self, object: FetchObject) {
    let mut map = self.objects.write().await;
    match map.get_mut(&object.group_id) {
      Some(objects) => {
        objects.push(object);
      }
      None => {
        map.insert(object.group_id, vec![object]);
      }
    }
  }

  pub async fn read_objects(&self, start: Location, end: Location) -> Receiver<FetchObject> {
    let (tx, rx) = channel(32); // Smaller buffer for memory efficiency
    let objects = self.objects.clone();

    // TODO: this can be done without using a task and sender-receiver pattern
    // but I'm doing this in order to lay the foundation for the future
    // when the cache will be filled eventually.
    tokio::spawn(async move {
      let guard = objects.read().await;
      if start.group >= end.group {
        warn!("start group cannot be greater than end group");
        return;
      }

      info!(
        "read_objects | start: {:?}, end: {:?}, objects len: {:?}",
        start,
        end,
        guard.len()
      );

      let range = guard.range(start.group..=end.group);

      info!("read_objects | range: {:?}", range.clone().count());

      // TODO: ordering of objects
      for (group_id, objects) in guard.iter() {
        info!("read_objects | group_id: {:?}", group_id);
        if *group_id < start.group {
          continue;
        }
        if *group_id > end.group {
          break;
        }
        for object in objects {
          if *group_id == end.group && end.object > 0 && end.object < object.object_id {
            // we hit the end of the range
            // if end object is 0, we return all objects in the group
            break;
          }
          if let Err(err) = tx.send(object.clone()).await {
            warn!("read_objects | An error occurred: {:?}", err);
            break; // Client disconnected
          }
          info!("read_objects | sent object: {:?}", object);
        }
      }
    });
    rx
  }

  // Get all headers in order from newest to oldest
  #[allow(dead_code)]
  pub async fn get_all_headers_ordered(&self) -> Vec<(String, HeaderInfo)> {
    let headers = self.headers.read().await;
    let header_queue = self.header_queue.read().await;

    let mut result = Vec::new();
    for header_id in header_queue.iter().rev() {
      if let Some(header) = headers.get(header_id) {
        result.push((header_id.clone(), header.clone()));
      }
    }
    result
  }
}
