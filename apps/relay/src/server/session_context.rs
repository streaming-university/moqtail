use std::{collections::BTreeMap, sync::Arc};
use tokio::sync::RwLock;
use tracing::error;
use wtransport::Connection;

use moqtail::transport::data_stream_handler::{FetchRequest, SubscribeRequest};

use super::{client::MOQTClient, client_manager::ClientManager, config::AppConfig, track::Track};

pub struct RequestMaps {
  pub fetch_requests: Arc<RwLock<BTreeMap<u64, FetchRequest>>>,
  pub relay_subscribe_requests: Arc<RwLock<BTreeMap<u64, SubscribeRequest>>>,
  pub client_subscribe_requests: Arc<RwLock<BTreeMap<u64, SubscribeRequest>>>,
}

pub struct SessionContext {
  pub(crate) client_manager: Arc<RwLock<ClientManager>>,
  pub(crate) tracks: Arc<RwLock<BTreeMap<u64, Track>>>, // the tracks the relay is subscribed to, key is the track alias
  pub(crate) fetch_requests: Arc<RwLock<BTreeMap<u64, FetchRequest>>>,
  pub(crate) relay_subscribe_requests: Arc<RwLock<BTreeMap<u64, SubscribeRequest>>>,
  pub(crate) client_subscribe_requests: Arc<RwLock<BTreeMap<u64, SubscribeRequest>>>,
  pub(crate) connection_id: usize,
  pub(crate) client: Arc<RwLock<Option<Arc<RwLock<MOQTClient>>>>>, // the client that is connected to this session
  pub(crate) connection: Connection,
  pub(crate) server_config: &'static AppConfig,
  pub(crate) is_connection_closed: Arc<RwLock<bool>>,
  pub(crate) relay_next_request_id: Arc<RwLock<u64>>,
}

impl SessionContext {
  pub fn new(
    server_config: &'static AppConfig,
    client_manager: Arc<RwLock<ClientManager>>,
    tracks: Arc<RwLock<BTreeMap<u64, Track>>>,
    request_maps: RequestMaps,
    connection: Connection,
    relay_next_request_id: Arc<RwLock<u64>>,
  ) -> Self {
    Self {
      client_manager,
      tracks,
      fetch_requests: request_maps.fetch_requests,
      relay_subscribe_requests: request_maps.relay_subscribe_requests,
      client_subscribe_requests: request_maps.client_subscribe_requests,
      connection_id: connection.stable_id(),
      client: Arc::new(RwLock::new(None)), // initially no client is set
      connection,
      server_config,
      is_connection_closed: Arc::new(RwLock::new(false)),
      relay_next_request_id,
    }
  }

  pub async fn set_client(&self, client: Arc<RwLock<MOQTClient>>) {
    let mut c = self.client.write().await;
    *c = Some(client);
  }

  pub async fn get_client(&self) -> Option<Arc<RwLock<MOQTClient>>> {
    let c = self.client.read().await;
    match c.as_ref() {
      Some(client) => Some(client.clone()),
      None => {
        error!("no client found");
        None
      }
    }
  }
}
