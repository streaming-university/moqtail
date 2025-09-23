use bytes::Bytes;
use moqtail::{
  model::{control::control_message::ControlMessage, error::TerminationCode},
  transport::control_stream_handler::ControlStreamHandler,
};
use tracing::info;

use crate::server::{client::MOQTClient, session_context::SessionContext};
use std::sync::Arc;
mod fetch_handler;
mod max_request_id_handler;
mod publish_handler;
mod publish_namespace_handler;
mod subscribe_handler;
use super::utils;

pub struct MessageHandler {}

impl MessageHandler {
  pub async fn handle(
    client: Arc<MOQTClient>,
    control_stream_handler: &mut ControlStreamHandler,
    msg: ControlMessage,
    context: Arc<SessionContext>,
  ) -> Result<(), TerminationCode> {
    let handling_result = match &msg {
      ControlMessage::PublishNamespace(_) => {
        publish_namespace_handler::handle(
          client.clone(),
          control_stream_handler,
          msg,
          context.clone(),
        )
        .await
      }
      ControlMessage::MaxRequestId(_) => {
        max_request_id_handler::handle(client.clone(), control_stream_handler, msg, context.clone())
          .await
      }
      ControlMessage::Subscribe(_)
      | ControlMessage::SubscribeOk(_)
      | ControlMessage::SubscribeUpdate(_)
      | ControlMessage::SubscribeError(_)
      | ControlMessage::Unsubscribe(_) => {
        subscribe_handler::handle(client.clone(), control_stream_handler, msg, context.clone())
          .await
      }
      ControlMessage::Fetch(_) | ControlMessage::FetchOk(_) => {
        fetch_handler::handle(client.clone(), control_stream_handler, msg, context.clone()).await
      }
      ControlMessage::Publish(_) | ControlMessage::PublishDone(_) => {
        publish_handler::handle(client.clone(), control_stream_handler, msg, context.clone()).await
      }

      m => {
        info!("some message received");
        let a = m.serialize().unwrap();
        let buf = Bytes::from_iter(a);
        utils::print_bytes(&buf);
        Ok(())
      }
    }; // end of if

    if let Err(termination_code) = handling_result {
      Err(termination_code)
    } else {
      Ok(())
    }
  }
}
