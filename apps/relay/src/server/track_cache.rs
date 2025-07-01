use moqtail::model::data::object::Object;
use moqtail::transport::data_stream_handler::HeaderInfo;
use std::{
  collections::{BTreeMap, VecDeque},
  sync::Arc,
};
use tokio::sync::RwLock;
use tracing::debug;

use crate::server::utils;

#[derive(Debug, Clone)]
pub struct TrackCache {
  pub track_alias: u64,
  headers: Arc<RwLock<BTreeMap<String, HeaderInfo>>>,
  objects: Arc<RwLock<BTreeMap<String, Vec<Object>>>>,
  // Ring buffer implementation: keep track of header IDs in order of insertion
  header_queue: Arc<RwLock<VecDeque<String>>>,
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

  pub async fn add_header(&self, header: HeaderInfo) -> Option<HeaderInfo> {
    let header_id = utils::build_header_id(&header);

    debug!(
      "add_header | track: {} header: {}",
      self.track_alias, header_id
    );

    // Check if we need to evict the oldest header
    self.ensure_capacity(&header_id).await;

    // Add new header to queue
    let mut header_queue = self.header_queue.write().await;
    header_queue.push_back(header_id.clone());

    // Store the header
    let mut headers = self.headers.write().await;
    headers.insert(header_id, header)
  }

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

  pub async fn add_object(&self, header_id: String, object: Object) {
    // Only add object if the header exists (is in our ring buffer)
    if self.headers.read().await.contains_key(&header_id) {
      let mut map = self.objects.write().await;
      match map.get_mut(&header_id) {
        Some(objects) => {
          objects.push(object);
        }
        None => {
          map.insert(header_id, vec![object]);
        }
      }
    }
  }

  // Add helper methods to retrieve data from the cache
  #[allow(dead_code)]
  pub async fn get_header(&self, header_id: &str) -> Option<HeaderInfo> {
    self.headers.read().await.get(header_id).cloned()
  }

  #[allow(dead_code)]
  pub async fn get_objects(&self, header_id: &str) -> Option<Vec<Object>> {
    self.objects.read().await.get(header_id).cloned()
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
