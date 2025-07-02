use anyhow::Result;
use clap::Parser;
use std::sync::OnceLock;
use std::time::Duration;
use tracing::error;
use wtransport::{Identity, ServerConfig};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
pub struct Cli {
  /// Port to bind
  #[arg(long, default_value_t = 4433)]
  pub port: u16,
  /// Host to bind
  #[arg(long, default_value = "localhost")]
  pub host: String,
  /// Certificate PEM file
  #[arg(long, default_value = "apps/relay/cert/cert.pem")]
  pub cert_file: String,
  /// Private key PEM file
  #[arg(long, default_value = "apps/relay/cert/key.pem")]
  pub key_file: String,
  /// Number of cached subgroups/fetches per track
  #[arg(long, default_value_t = 10)]
  pub cache_size: u16,
  #[arg(long, default_value_t = 7)]
  pub max_idle_timeout: u64,
  #[arg(long, default_value_t = 3)]
  pub keep_alive_interval: u64,
  #[arg(long, default_value = ".")]
  pub log_folder: String,
}
#[derive(Debug, Clone)]
pub struct AppConfig {
  pub port: u16,
  pub host: String,
  pub cert_file: String,
  pub key_file: String,
  pub max_idle_timeout: u64,
  pub keep_alive_interval: u64,
  pub cache_size: u16,
  pub log_folder: String,
}

impl AppConfig {
  pub fn load() -> &'static Self {
    static INSTANCE: OnceLock<AppConfig> = OnceLock::new();
    INSTANCE.get_or_init(|| {
      let cli = Cli::parse();
      AppConfig {
        port: cli.port,
        host: cli.host,
        cert_file: cli.cert_file,
        key_file: cli.key_file,
        max_idle_timeout: cli.max_idle_timeout,
        keep_alive_interval: cli.keep_alive_interval,
        cache_size: cli.cache_size,
        log_folder: cli.log_folder,
      }
    })
  }

  pub async fn build_server_config(&self) -> Result<ServerConfig> {
    let identity = match Identity::load_pemfiles(&self.cert_file, &self.key_file).await {
      Ok(identity) => identity,
      Err(e) => {
        error!("Failed to load identity from PEM files: {:?}", e);
        return Err(e.into());
      }
    };

    let config = ServerConfig::builder()
      .with_bind_default(self.port)
      .with_identity(identity)
      .keep_alive_interval(Some(Duration::from_secs(self.keep_alive_interval)))
      .max_idle_timeout(Some(Duration::from_secs(self.max_idle_timeout)))
      .unwrap()
      .build();

    Ok(config)
  }
}
