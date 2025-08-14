use crate::server::client::MOQTClient;
use crate::server::session_context::SessionContext;
use crate::server::utils::build_stream_id;
use core::result::Result::{Err, Ok};
use moqtail::model::control::constant::FetchErrorCode;
use moqtail::model::control::control_message::ControlMessage;
use moqtail::model::control::fetch_error::FetchError;
use moqtail::model::control::fetch_ok::FetchOk;
use moqtail::model::data::fetch_header::FetchHeader;
use moqtail::model::error::TerminationCode;
use moqtail::model::{common::reason_phrase::ReasonPhrase, control::constant::FetchType};
use moqtail::transport::control_stream_handler::ControlStreamHandler;
use moqtail::transport::data_stream_handler::HeaderInfo;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

pub async fn handle_fetch_messages(
  client: Arc<RwLock<MOQTClient>>,
  control_stream_handler: &mut ControlStreamHandler,
  msg: ControlMessage,
  context: Arc<SessionContext>,
  _relay_next_request_id: Arc<tokio::sync::RwLock<u64>>,
) -> Result<(), TerminationCode> {
  match msg {
    ControlMessage::Fetch(m) => {
      info!("received Fetch message: {:?}", m);
      let fetch = *m;

      if matches!(
        fetch.fetch_type,
        FetchType::AbsoluteFetch | FetchType::RelativeFetch
      ) {
        // TODO: support other fetch types
        return Err(TerminationCode::InternalError);
      }
      let request_id = fetch.request_id;
      let props = fetch.standalone_fetch_props.clone().unwrap();

      // let's see whether the track is in the cache
      let track = {
        let tracks = context.tracks.read().await;
        tracks
          .iter()
          .find(|e| {
            e.1.track_namespace == props.track_namespace && e.1.track_name == props.track_name
          })
          .map(|track| track.1.clone())
      };

      // TODO: send fetch message to the publisher
      if track.is_none() {
        // TODO: send fetch message to the possible publishers
        // for now just return FETCH_ERROR
        let fetch_error = FetchError::new(
          request_id,
          FetchErrorCode::TrackDoesNotExist,
          ReasonPhrase::try_new(String::from("Track does not exist")).unwrap(),
        );
        let client = client.read().await;
        client
          .queue_message(ControlMessage::FetchError(Box::new(fetch_error)))
          .await;
        return Ok(());
      }

      let track = track.unwrap();

      // TODO: verify the range exist. Currently we just return what we have...

      let mut object_rx = track
        .cache
        .read_objects(props.start_location.clone(), props.end_location.clone())
        .await;

      let fetch_header = FetchHeader::new(request_id);
      let header_info = HeaderInfo::Fetch {
        header: fetch_header,
        fetch_request: fetch,
      };

      let client = client.read().await;

      let stream_id = build_stream_id(track.track_alias, &header_info);
      let stream_result = client
        .open_stream(&stream_id, fetch_header.serialize().unwrap(), 0)
        .await;

      let send_stream = match stream_result {
        Ok(send_stream) => send_stream,
        Err(e) => {
          error!("handle_fetch_messages | Error opening stream: {:?}", e);
          return Err(TerminationCode::InternalError);
        }
      };
      let mut object_count = 0;
      loop {
        match object_rx.recv().await {
          Some(object) => {
            let object_id = object.object_id;
            if let Err(e) = client
              .write_object_to_stream(
                &stream_id,
                object_id,
                object.serialize().unwrap(),
                Some(send_stream.clone()),
              )
              .await
            {
              error!(
                "handle_fetch_messages | Error writing object to stream: {:?}",
                e
              );
              return Err(TerminationCode::InternalError);
            }
            object_count += 1;
          }
          None => {
            warn!("handle_fetch_messages | No object.");
            break;
          }
        }
      }
      if object_count == 0 {
        let fetch_error = FetchError::new(
          request_id,
          FetchErrorCode::NoObjects,
          ReasonPhrase::try_new(String::from("No objects available")).unwrap(),
        );
        client
          .queue_message(ControlMessage::FetchError(Box::new(fetch_error)))
          .await;
        return Ok(());
      }
      // TODO: implement descending fetch
      let fetch_ok = FetchOk::new_ascending(request_id, false, props.end_location.clone(), vec![]);

      control_stream_handler.send_impl(&fetch_ok).await
    }
    ControlMessage::FetchOk(m) => {
      info!("received FetchOk message: {:?}", m);
      let _msg = *m;

      Ok(())
    }
    _ => {
      // no-op
      Ok(())
    }
  }
}
