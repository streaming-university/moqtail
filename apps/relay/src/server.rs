mod client;
mod client_manager;
mod config;
mod errors;
mod session;
mod track;
mod track_cache;
mod utils;

use crate::server::{config::AppConfig, session::Session};
use anyhow::Result;
use client_manager::ClientManager;
use dashmap::DashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info};
use tracing_subscriber::fmt::writer::MakeWriterExt;
use tracing_subscriber::{EnvFilter, filter::LevelFilter};
use track::Track;
use wtransport::Endpoint;

pub(crate) struct Server {
  pub client_manager: Arc<RwLock<ClientManager>>,
  pub tracks: Arc<DashMap<u64, Track>>, // the tracks the relay is subscribed to, key is the track alias
  pub app_config: &'static AppConfig,
}

impl Server {
  pub fn new() -> Self {
    let config = AppConfig::load();

    init_logging(&config.log_folder);

    debug!("Server | App. Config.: {:?}", config);

    Server {
      client_manager: Arc::new(RwLock::new(ClientManager::new())),
      tracks: Arc::new(DashMap::new()),
      app_config: config,
    }
  }

  pub async fn start(&mut self) -> Result<()> {
    let server_config = self.app_config.build_server_config().await?;
    let server = Endpoint::server(server_config)?;

    info!("MOQtail Relay is running!");
    info!(
      "URL: https://{}:{}",
      self.app_config.host, self.app_config.port
    );

    let app_config = self.app_config;

    for id in 0.. {
      let incoming_session = server.accept().await;
      let client_manager = self.client_manager.clone();
      let tracks = self.tracks.clone();
      tokio::spawn(async move {
        match Session::new(incoming_session, client_manager, tracks, app_config).await {
          Ok(_) => {
            info!("new session: {}", id);
          }
          Err(e) => {
            error!("Error occurred in session {}: {:?}", id, e);
          }
        }
      });
    }
    Ok(())
  }
}

fn init_logging(log_dir: &str) {
  let env_filter = EnvFilter::builder()
    .with_default_directive(LevelFilter::INFO.into())
    .from_env_lossy();

  // Ensure the log directory exists
  std::fs::create_dir_all(log_dir).expect("Failed to create log directory");

  let file_appender = tracing_appender::rolling::daily(log_dir, "relay.log");
  let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

  tracing_subscriber::fmt()
    .with_target(true)
    .with_level(true)
    .with_env_filter(env_filter)
    .with_writer(non_blocking.and(std::io::stdout))
    .init();
}
