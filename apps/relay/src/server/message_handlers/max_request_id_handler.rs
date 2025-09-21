use crate::server::client::MOQTClient;
use crate::server::session_context::SessionContext;
use core::result::Result;
use moqtail::model::control::control_message::ControlMessage;
use moqtail::model::error::TerminationCode;
use moqtail::transport::control_stream_handler::ControlStreamHandler;
use std::sync::Arc;
use tracing::{info, warn};

pub async fn handle(
  _client: Arc<MOQTClient>,
  _control_stream_handler: &mut ControlStreamHandler,
  msg: ControlMessage,
  context: Arc<SessionContext>,
) -> Result<(), TerminationCode> {
  match msg {
    ControlMessage::MaxRequestId(m) => {
      // TODO: the namespace is already announced, return error
      info!("received MaxRequestId message");

      let new_max_request_id = m.request_id;

      {
        let current_max_request_id = context.max_request_id.read().await;
        if *current_max_request_id >= new_max_request_id {
          warn!("received MaxRequestId message with lower request id than previously announced");
          return Err(TerminationCode::ProtocolViolation);
        }
      }

      info!("setting new maxrequest id to {}", new_max_request_id);
      *context.max_request_id.write().await = new_max_request_id;
      Ok(())
    }
    _ => {
      // no-op
      Ok(())
    }
  }
}
