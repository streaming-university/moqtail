use super::track_cache::TrackCache;
use crate::server::client::MOQTClient;
use crate::server::subscription::Subscription;
use crate::server::utils;
use anyhow::Result;
use moqtail::model::control::subscribe::Subscribe;
use moqtail::model::data::object::Object;
use moqtail::{model::common::tuple::Tuple, transport::data_stream_handler::HeaderInfo};
use std::time::Instant;
use std::{collections::BTreeMap, sync::Arc};
use tokio::sync::RwLock;
use tokio::sync::broadcast::{Receiver, Sender};
use tracing::{debug, error, info};

#[derive(Debug, Clone)]
pub enum TrackEvent {
  Header { header: HeaderInfo },
  Object { stream_id: String, object: Object },
  StreamClosed { stream_id: String },
  PublisherDisconnected { reason: String },
}
#[derive(Debug, Clone)]
pub struct Track {
  #[allow(dead_code)]
  pub track_alias: u64,
  #[allow(dead_code)]
  pub track_namespace: Tuple,
  #[allow(dead_code)]
  pub track_name: String,
  subscriptions: Arc<RwLock<BTreeMap<usize, Arc<RwLock<Subscription>>>>>,
  pub publisher_connection_id: usize,
  #[allow(dead_code)]
  pub(crate) cache: TrackCache,
  event_tx: Sender<TrackEvent>,
  #[allow(dead_code)]
  event_rx: Arc<Receiver<TrackEvent>>,
}

// TODO: this track implementation should be static? At least
// its lifetime should be same as the server's lifetime
impl Track {
  pub fn new(
    track_alias: u64,
    track_namespace: Tuple,
    track_name: String,
    cache_size: usize,
    publisher_connection_id: usize,
  ) -> Self {
    let (event_tx, event_rx) = tokio::sync::broadcast::channel(1000);

    Track {
      track_alias,
      track_namespace,
      track_name,
      subscriptions: Arc::new(RwLock::new(BTreeMap::new())),
      publisher_connection_id,
      cache: TrackCache::new(track_alias, cache_size),
      event_tx,
      event_rx: Arc::new(event_rx), // Keep the receiver alive so that the sender stays alive
    }
  }

  pub async fn add_subscription(
    &mut self,
    subscriber: Arc<RwLock<MOQTClient>>,
    subscribe_message: Subscribe,
  ) -> Result<(), anyhow::Error> {
    let connection_id = { subscriber.read().await.connection_id };

    info!(
      "Adding subscription for subscriber_id: {} to track: {}",
      connection_id, self.track_alias
    );
    let event_rx = self.event_tx.subscribe();
    let subscription = Subscription::new(
      subscribe_message,
      subscriber.clone(),
      event_rx,
      self.cache.clone(),
      connection_id,
    );

    let mut subscriptions = self.subscriptions.write().await;
    if subscriptions.contains_key(&connection_id) {
      error!(
        "Subscriber with connection_id: {} already exists in track: {}",
        connection_id, self.track_alias
      );
      return Err(anyhow::anyhow!("Subscriber already exists"));
    }
    subscriptions.insert(connection_id, Arc::new(RwLock::new(subscription)));

    Ok(())
  }

  pub async fn remove_subscription(&mut self, subscriber_id: usize) {
    info!(
      "Removing subscription for subscriber_id: {} from track: {}",
      subscriber_id, self.track_alias
    );
    let mut subscriptions = self.subscriptions.write().await;
    // find the subscription by subscriber_id and finish it
    if let Some(subscription) = subscriptions.get(&subscriber_id) {
      let mut sub = subscription.write().await;
      sub.finish().await;
    }
    subscriptions.remove(&subscriber_id);
  }

  pub async fn new_header(&self, header: &HeaderInfo) -> Result<()> {
    let header_event = TrackEvent::Header {
      header: header.clone(),
    };

    match self.event_tx.send(header_event) {
      Ok(_) => {
        info!("Header sent successfully: {:?}", header);
      }
      Err(e) => {
        tracing::error!("Failed to send header: {}", e);
        return Err(anyhow::Error::from(e));
      }
    };

    Ok(())
  }

  pub async fn new_object(&self, stream_id: String, object: &Object) -> Result<(), anyhow::Error> {
    debug!(
      "new_object: track: {:?} location: {:?} stream_id: {} diff_ms: {}",
      object.track_alias,
      object.location,
      &stream_id,
      (Instant::now() - *utils::BASE_TIME).as_millis()
    );

    if let Ok(fetch_object) = object.clone().try_into_fetch() {
      self.cache.add_object(fetch_object).await;
      let object_event = TrackEvent::Object {
        stream_id: stream_id.clone(),
        object: object.clone(),
      };

      match self.event_tx.send(object_event) {
        Ok(_) => {}
        Err(e) => {
          tracing::error!("Failed to send object: stream_id: {}, e: {}", stream_id, e);
          return Err(anyhow::Error::from(e));
        }
      };
      Ok(())
    } else {
      error!(
        "new_object: track: {:?} location: {:?} stream_id: {} diff_ms: {} object: {:?}",
        object.track_alias,
        object.location,
        stream_id,
        (Instant::now() - *utils::BASE_TIME).as_millis(),
        object
      );
      Err(anyhow::anyhow!("Object is not a fetch object"))
    }
  }

  pub async fn stream_closed(&self, stream_id: String) -> Result<(), anyhow::Error> {
    let event = TrackEvent::StreamClosed { stream_id };

    match self.event_tx.send(event) {
      Ok(_) => {}
      Err(e) => {
        tracing::error!("Failed to send closed event: {}", e);
        return Err(anyhow::Error::from(e));
      }
    };
    Ok(())
  }

  /// Send PublisherDisconnected event to all subscribers
  pub async fn notify_publisher_disconnected(&self) -> Result<(), anyhow::Error> {
    info!(
      "Publisher disconnected for track: {} - notifying all subscribers",
      self.track_alias
    );

    let event = TrackEvent::PublisherDisconnected {
      reason: "Publisher disconnected".to_string(),
    };

    match self.event_tx.send(event) {
      Ok(_) => {
        info!(
          "Publisher disconnected event sent successfully for track: {}",
          self.track_alias
        );
      }
      Err(e) => {
        error!(
          "Failed to send publisher disconnected event for track {}: {}",
          self.track_alias, e
        );
        return Err(anyhow::Error::from(e));
      }
    }

    Ok(())
  }
}

// TODO: Test
