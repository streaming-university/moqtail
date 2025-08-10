use std::{collections::BTreeMap, sync::Arc};
use tokio::sync::RwLock;
use tracing::error;
use wtransport::Connection;

use moqtail::transport::data_stream_handler::{FetchRequest, SubscribeRequest};

use super::{client::MOQTClient, client_manager::ClientManager, config::AppConfig, track::Track};

pub struct SessionContext {
  pub(crate) client_manager: Arc<RwLock<ClientManager>>,
  pub(crate) tracks: Arc<RwLock<BTreeMap<u64, Track>>>, // the tracks the relay is subscribed to, key is the track alias
  pub(crate) _fetch_requests: Arc<RwLock<BTreeMap<u64, FetchRequest>>>,
  pub(crate) subscribe_requests: Arc<RwLock<BTreeMap<u64, SubscribeRequest>>>,
  pub(crate) connection_id: usize,
  pub(crate) client: Arc<RwLock<Option<Arc<RwLock<MOQTClient>>>>>, // the client that is connected to this session
  pub(crate) connection: Connection,
  pub(crate) server_config: &'static AppConfig,
  pub(crate) is_connection_closed: Arc<RwLock<bool>>,
}

impl SessionContext {
  pub fn new(
    server_config: &'static AppConfig,
    client_manager: Arc<RwLock<ClientManager>>,
    tracks: Arc<RwLock<BTreeMap<u64, Track>>>,
    fetch_requests: Arc<RwLock<BTreeMap<u64, FetchRequest>>>,
    subscribe_requests: Arc<RwLock<BTreeMap<u64, SubscribeRequest>>>,
    connection: Connection,
  ) -> Self {
    Self {
      client_manager,
      tracks,
      _fetch_requests: fetch_requests,
      subscribe_requests,
      connection_id: connection.stable_id(),
      client: Arc::new(RwLock::new(None)), // initially no client is set
      connection,
      server_config,
      is_connection_closed: Arc::new(RwLock::new(false)),
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
