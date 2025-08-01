use crate::server::client::MOQTClient;
use crate::server::session_context::SessionContext;
use core::result::Result;
use moqtail::model::control::control_message::ControlMessage;
use moqtail::model::error::TerminationCode;
use moqtail::transport::control_stream_handler::ControlStreamHandler;
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn handle_fetch_messages(
  _client: Arc<RwLock<MOQTClient>>,
  _control_stream_handler: &mut ControlStreamHandler,
  _msg: ControlMessage,
  _context: Arc<SessionContext>,
  _relay_next_request_id: Arc<tokio::sync::RwLock<u64>>,
) -> Result<(), TerminationCode> {
  /*
  match msg {
    ControlMessage::Fetch(m) => {
      info!("received Fetch message: {:?}", m);
      let fetch = *m;
      // TODO: support other fetch types, verify request id, proper error checking
      let props = fetch.standalone_fetch_props.unwrap();

      // find the track by track namespace and track name
      let track = {
        let tracks = context.tracks.read().await;
        let track = tracks.iter().find(|e| e.1.track_namespace == props.track_namespace && e.1.track_name == props.track_name);
        track.map(|x| *x.1)
      };

      if track.is_some() {
        let track = track.unwrap();
        let rx = track.cache.read_objects(props.start_location, props.end_location).await;

        loop {
          match event_rx.recv().await {
            Ok(event) => match event {
              // event.
            },
            Err(_) => {

            }
        }
          // TODO: Send the first sub_ok message to the subscriber
        // for now, just sending some default values
        let fetch_ok =
          moqtail::model::control::subscribe_ok::FetchOk::{}

        return control_stream_handler
          .send_impl(&fetch_ok)
          .await;
      }



    }
    ControlMessage::FetchOk(m) => {
      info!("received FetchOk message: {:?}", m);
      let msg = *m;

      return Ok(());
    }
    _ => {
      // no-op
      return Ok(());

    }
  } */
  Ok(())
}
