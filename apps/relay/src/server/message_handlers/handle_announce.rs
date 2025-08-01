use crate::server::client::MOQTClient;
use crate::server::session_context::SessionContext;
use core::result::Result;
use moqtail::model::control::{announce_ok::AnnounceOk, control_message::ControlMessage};
use moqtail::model::error::TerminationCode;
use moqtail::transport::control_stream_handler::ControlStreamHandler;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

pub async fn handle_announce_messages(
  client: Arc<RwLock<MOQTClient>>,
  control_stream_handler: &mut ControlStreamHandler,
  msg: ControlMessage,
  _context: Arc<SessionContext>,
  _relay_next_request_id: Arc<tokio::sync::RwLock<u64>>,
) -> Result<(), TerminationCode> {
  match msg {
    ControlMessage::Announce(m) => {
      // TODO: the namespace is already announced, return error
      info!("received Announce message");
      // this is a publisher, add it to the client manager
      // send announce_ok
      client
        .read()
        .await
        .add_announced_track_namespace(m.track_namespace.clone())
        .await;

      let announce_ok = Box::new(AnnounceOk {
        request_id: m.request_id,
      });
      control_stream_handler
        .send(&ControlMessage::AnnounceOk(announce_ok))
        .await
    }
    _ => {
      // no-op
      Ok(())
    }
  }
}
