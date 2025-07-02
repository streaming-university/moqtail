mod client;

use client::Client;
use std::env;
use tracing::info;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::filter::LevelFilter;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
  init_logging();

  let is_publisher = env::args()
    .nth(1)
    .unwrap_or_else(|| "subscriber".to_string())
    == "publisher";

  let endpoint = env::args()
    .nth(2)
    .unwrap_or_else(|| "https://[::1]:4433".to_string());

  let validate_cert = env::args().nth(3).unwrap_or_else(|| "false".to_string()) == "true";

  info!("Starting client...");
  info!("Is publisher: {}", is_publisher);
  info!("Endpoint: {}", endpoint);
  info!("Validate cert: {}", validate_cert);

  let mut client = Client::new(endpoint, is_publisher, validate_cert);
  client.run().await
}

fn init_logging() {
  let env_filter = EnvFilter::builder()
    .with_default_directive(LevelFilter::INFO.into())
    .from_env_lossy();

  tracing_subscriber::fmt()
    .with_target(true)
    .with_level(true)
    .with_env_filter(env_filter)
    .init();
}
