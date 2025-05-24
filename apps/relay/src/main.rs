use tracing::Instrument;
mod server;
use server::Server;

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
  let mut server = Server::new();
  let _ = server
    .start()
    .instrument(tracing::info_span!("server"))
    .await;
  Ok(())
}
