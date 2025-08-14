use moqtail::model::control::fetch::Fetch;
use tokio::sync::{RwLock, Arc};
use moqtail::client::MOQTClient;
use wtransport::SendStream;

pub struct FetchRequest {
  pub fetch_message: Fetch,
  pub client: Arc<RwLock<MOQTClient>>,
  pub send_stream: SendStream,
  pub finished: Arc<RwLock<bool>>,
}

impl FetchRequest {
  pub fn new(fetch_message: Fetch, client: Arc<RwLock<MOQTClient>>, send_stream: SendStream) -> Self {
    Self { fetch_message, client, send_stream, finished: Arc::new(RwLock::new(false)) }
  }
}