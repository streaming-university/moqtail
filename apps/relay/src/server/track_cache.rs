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
  objects: Arc<RwLock<BTreeMap<u64, RwLock<Vec<FetchObject>>>>>,
  // Ring buffer implementation: keep track of header IDs in order of insertion
  header_queue: Arc<RwLock<VecDeque<String>>>,
  #[allow(dead_code)]
  cache_size: usize,
  cache_grow_ratio_before_evicting: f64,
}

impl TrackCache {
  pub fn new(track_alias: u64, cache_size: usize, cache_grow_ratio_before_evicting: f64) -> Self {
    Self {
      track_alias,
      headers: Arc::new(RwLock::new(BTreeMap::new())),
      objects: Arc::new(RwLock::new(BTreeMap::new())),
      header_queue: Arc::new(RwLock::new(VecDeque::with_capacity(cache_size))),
      cache_size,
      cache_grow_ratio_before_evicting,
    }
  }

  // Ensure we don't exceed capacity by removing oldest elements if needed
  // Uses a ratio-based approach: allows cache to grow to configured ratio of capacity before evicting

  #[allow(dead_code)]
  async fn ensure_capacity(&self) {
    let max_allowed_size =
      (self.cache_size as f64 * self.cache_grow_ratio_before_evicting) as usize;

    let objects = self.objects.read().await;

    // Only evict if we exceed the ratio-based threshold
    if objects.len() > max_allowed_size {
      drop(objects);
      let mut objects = self.objects.write().await;

      // Calculate how many elements to remove (remove excess beyond normal capacity)
      let excess_count = objects.len() - self.cache_size;
      let mut removed_count = 0;

      debug!(
        "ensure_capacity | cache exceeded ratio threshold. track: {} current: {} max_allowed: {} removing: {}",
        self.track_alias,
        objects.len(),
        max_allowed_size,
        excess_count
      );

      // Remove excess elements in batch
      while removed_count < excess_count && !objects.is_empty() {
        match objects.pop_first() {
          Some((group_id, _)) => {
            removed_count += 1;
            warn!(
              "ensure_capacity | removed oldest group. track: {} group: {} ({}/{} removed)",
              self.track_alias, group_id, removed_count, excess_count
            );
          }
          None => {
            warn!(
              "ensure_capacity | unable to remove group from track cache. track: {} ",
              self.track_alias
            );
            break;
          }
        };
      }

      info!(
        "ensure_capacity | eviction complete. track: {} final_size: {} removed: {}",
        self.track_alias,
        objects.len(),
        removed_count
      );
    }
  }

  pub async fn add_object(&self, object: FetchObject) {
    let group_id = object.group_id;
    let is_new_group = {
      let map = self.objects.read().await;
      if let Some(objects) = map.get(&object.group_id) {
        let mut arr = objects.write().await;
        arr.push(object.clone());
        false
      } else {
        true
      }
    };

    if is_new_group {
      let mut map = self.objects.write().await;
      map.insert(group_id, RwLock::new(vec![object]));
    }

    // if this is a new group, check if we need to evict old groups from the cache
    if is_new_group {
      // self.ensure_capacity().await;
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
      for (group_id, objects_guard) in range {
        let objects = objects_guard.read().await;

        if *group_id < start.group {
          continue;
        }
        if *group_id > end.group {
          break;
        }
        info!("read_objects | group_id: {:?}", group_id);
        for object in objects.iter() {
          if *group_id == end.group && end.object > 0 && end.object < object.object_id {
            // we hit the end of the range
            // if end object is 0, we return all objects in the group
            break;
          }
          if let Err(err) = tx.send(object.clone()).await {
            warn!("read_objects | An error occurred: {:?}", err);
            break; // Client disconnected
          }
          debug!("read_objects | sent object: {:?}", object);
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
