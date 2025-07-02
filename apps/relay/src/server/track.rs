use super::track_cache::TrackCache;
use moqtail::model::data::object::Object;
use moqtail::{model::common::tuple::Tuple, transport::data_stream_handler::HeaderInfo};
use std::{collections::BTreeMap, sync::Arc};
use tokio::sync::RwLock;

use super::client::MOQTClient;

#[derive(Debug, Clone)]
pub struct Track {
  #[allow(dead_code)]
  pub track_alias: u64,
  #[allow(dead_code)]
  pub track_namespace: Tuple,
  #[allow(dead_code)]
  pub track_name: String,
  subscribers: Arc<RwLock<BTreeMap<usize, Arc<RwLock<MOQTClient>>>>>,
  cache: TrackCache,
}

// TODO: this track implementation should be static? At least
// its lifetime should be same as the server's lifetime
impl Track {
  pub fn new(
    track_alias: u64,
    track_namespace: Tuple,
    track_name: String,
    cache_size: usize,
  ) -> Self {
    Track {
      track_alias,
      track_namespace,
      track_name,
      subscribers: Arc::new(RwLock::new(BTreeMap::new())),
      cache: TrackCache::new(track_alias, cache_size),
    }
  }

  pub fn get_subscribers(&self) -> Arc<RwLock<BTreeMap<usize, Arc<RwLock<MOQTClient>>>>> {
    self.subscribers.clone()
  }

  pub async fn add_subscriber(&mut self, subscriber: (usize, Arc<RwLock<MOQTClient>>)) {
    let mut subscribers = self.subscribers.write().await;
    subscribers.insert(subscriber.0, subscriber.1);
  }

  pub async fn remove_subscriber(&mut self, subscriber_id: &usize) {
    let mut subscribers = self.subscribers.write().await;
    subscribers.remove(subscriber_id);
  }

  pub async fn add_header(&self, header: HeaderInfo) -> Option<HeaderInfo> {
    self.cache.add_header(header).await
  }

  pub async fn add_object(&self, header_id: String, object: Object) {
    self.cache.add_object(header_id, object).await;
  }
}

// TODO: Test
