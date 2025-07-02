use super::client::MOQTClient;
use moqtail::model::common::tuple::Tuple;
use std::{collections::BTreeMap, sync::Arc};
use tokio::sync::RwLock;
use tracing::{debug, info};

pub(crate) struct ClientManager {
  // TODO: get rid of dashmap and use RwLock with BTree
  pub clients: Arc<RwLock<BTreeMap<usize, Arc<RwLock<MOQTClient>>>>>,
}

impl ClientManager {
  pub(crate) fn new() -> Self {
    ClientManager {
      clients: Arc::new(RwLock::new(BTreeMap::new())),
    }
  }

  pub(crate) async fn add(&mut self, client: Arc<RwLock<MOQTClient>>) {
    let connection_id = client.read().await.connection_id;
    let mut clients = self.clients.write().await;
    clients.insert(connection_id, client);
    info!("Added client connection_id: {}", connection_id);
  }

  pub(crate) async fn remove(&mut self, connection_id: usize) {
    let mut clients = self.clients.write().await;
    clients.remove(&connection_id);
  }

  pub(crate) async fn get(&self, connection_id: usize) -> Option<Arc<RwLock<MOQTClient>>> {
    let clients = self.clients.read().await;
    clients.get(&connection_id).cloned()
  }

  // TODO: same namespace can be used by different publishers
  // In our implementation, we expect a unique namespace is announced
  // by every publisher such as /moqtail/my_room/user_1
  // This can be solved by the Publish message.
  pub(crate) async fn get_publisher_by_announced_track_namespace(
    &self,
    track_namespace: &Tuple,
  ) -> Option<Arc<RwLock<MOQTClient>>> {
    let clients = self.clients.read().await;
    for client_ref in clients.iter() {
      debug!("checking client: {:?}", client_ref.0);
      let client = client_ref.1.read().await;

      debug!(
        "client announced track namespaces: {:?} track namespace: {:?}",
        client.announced_track_namespaces, track_namespace
      );
      let announced_track_namespaces = client.announced_track_namespaces.read().await;

      for announced_track_namespace in announced_track_namespaces.iter() {
        // Check if track_namespace is equal to or a child of announced_track_namespace
        if track_namespace.starts_with(announced_track_namespace) {
          return Some(client_ref.1.clone());
        }
      }
    }
    None
  }
}
