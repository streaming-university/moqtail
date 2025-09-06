use crate::server::client::MOQTClient;
use crate::server::session::Session;
use crate::server::session_context::SessionContext;
use crate::server::track::Track;
use core::result::Result;
use moqtail::model::error::TerminationCode;
use moqtail::model::{
  common::reason_phrase::ReasonPhrase, control::control_message::ControlMessage,
};
use moqtail::transport::control_stream_handler::ControlStreamHandler;
use moqtail::transport::data_stream_handler::SubscribeRequest;
use std::sync::Arc;
use tracing::{debug, error, info, warn};

pub async fn handle_subscribe_messages(
  _client: Arc<MOQTClient>,
  control_stream_handler: &mut ControlStreamHandler,
  msg: ControlMessage,
  context: Arc<SessionContext>,
) -> Result<(), TerminationCode> {
  match msg {
    ControlMessage::Subscribe(m) => {
      info!("received Subscribe message: {:?}", m);
      let sub = *m;
      let track_namespace = sub.track_namespace.clone();
      let client = context.get_client().await;

      // find who is the publisher
      let publisher = {
        debug!("trying to get the publisher");
        let m = context.client_manager.read().await;
        debug!(
          "client manager obtained, current client id: {}",
          context.connection_id
        );
        m.get_publisher_by_announced_track_namespace(&track_namespace)
          .await
      };

      let publisher = if let Some(publisher) = publisher {
        publisher.clone()
      } else {
        error!(
          "no publisher found for track namespace: {:?}",
          track_namespace
        );
        // send SubscribeError
        let subscribe_error = moqtail::model::control::subscribe_error::SubscribeError::new(
          sub.request_id,
          moqtail::model::control::constant::SubscribeErrorCode::TrackDoesNotExist,
          ReasonPhrase::try_new("Unknown track namespace".to_string()).unwrap(),
          sub.track_alias,
        );
        control_stream_handler
          .send_impl(&subscribe_error)
          .await
          .unwrap();
        return Ok(());
      };

      {
        publisher.add_subscriber(context.connection_id).await;
      }
      info!(
        "Subscriber ({}) added to the publisher ({})",
        context.connection_id, publisher.connection_id
      );

      let original_request_id = sub.request_id;
      let client = match client {
        Some(c) => c,
        None => return Err(TerminationCode::InternalError),
      };

      let res: Result<(), TerminationCode> =
        if !context.tracks.read().await.contains_key(&sub.track_alias) {
          info!("Track not found, creating new track: {:?}", sub.track_alias);
          // subscribed_tracks.insert(sub.track_alias, Track::new(sub.track_alias, track_namespace.clone(), sub.track_name.clone()));
          let mut track = Track::new(
            sub.track_alias,
            sub.track_namespace.clone(),
            sub.track_name.clone(),
            context.server_config.cache_size.into(),
            context.server_config.cache_grow_ratio_before_evicting,
            publisher.connection_id,
          );
          {
            context
              .tracks
              .write()
              .await
              .insert(sub.track_alias, track.clone());
          }

          let _ = track.add_subscription(client.clone(), sub.clone()).await;

          // send the subscribe message to the publisher
          let mut new_sub = sub.clone();
          new_sub.request_id =
            Session::get_next_relay_request_id(context.relay_next_request_id.clone()).await;

          publisher
            .queue_message(ControlMessage::Subscribe(Box::new(new_sub.clone())))
            .await;

          // add the track to the publisher's published tracks
          publisher.add_published_track(track.track_alias).await;

          // insert this request id into the relay's subscribe requests
          // TODO: we need to add a timeout here or another loop to control expired requests
          let req =
            SubscribeRequest::new(original_request_id, context.connection_id, new_sub.clone());
          let mut requests = context.relay_subscribe_requests.write().await;
          requests.insert(new_sub.request_id, req.clone());
          info!(
            "inserted request into relay's subscribe requests: {:?} with relay's request id: {:?}",
            req, new_sub.request_id
          );
          Ok(())
        } else {
          info!("track already exists, sending SubscribeOk");
          let mut tracks = context.tracks.write().await;
          let track = tracks.get_mut(&sub.track_alias).unwrap();
          let _ = track.add_subscription(client.clone(), sub.clone()).await;
          drop(tracks);

          // TODO: Send the first sub_ok message to the subscriber
          // for now, just sending some default values
          let subscribe_ok =
            moqtail::model::control::subscribe_ok::SubscribeOk::new_ascending_with_content(
              sub.request_id,
              0,
              None,
              None,
            );

          control_stream_handler.send_impl(&subscribe_ok).await
        };

      // return if there's an error
      if res.is_ok() {
        // insert this request id into the clients subscribe requests
        let req = SubscribeRequest::new(original_request_id, context.connection_id, sub.clone());
        let mut requests = context.client_subscribe_requests.write().await;
        requests.insert(sub.request_id, req.clone());
        info!(
          "inserted request into client's subscribe requests: {:?} with subscriber's request id: {:?}",
          req, sub.request_id
        );

        // also insert the request to the client's subscribe requests
        let mut requests = client.subscribe_requests.write().await;
        let orig_req =
          SubscribeRequest::new(original_request_id, context.connection_id, sub.clone());
        requests.insert(original_request_id, orig_req.clone());
        debug!(
          "inserted request into client's subscribe requests: {:?}",
          orig_req
        );
      } else {
        error!("error in adding subscription: {:?}", res);
      }
      res
    }
    ControlMessage::SubscribeOk(m) => {
      info!("received SubscribeOk message: {:?}", m);
      let msg = *m;

      // this comes from the publisher
      // it should be sent to the subscriber
      let request_id = msg.request_id;

      let mut sub_request = {
        let requests = context.relay_subscribe_requests.read().await;
        // print out every request
        debug!("current requests: {:?}", requests);
        match requests.get(&request_id) {
          Some(m) => {
            info!("request id is verified: {:?}", request_id);
            m.clone()
          }
          None => {
            warn!("request id is not verified: {:?}", request_id);
            return Ok(());
          }
        }
      };

      // replace the request id with the original request id
      sub_request.subscribe_request.request_id = sub_request.original_request_id;

      // TODO: honor the values in the subscribe_ok message like
      // expires, group_order, content_exists, largest_location

      // now we're ready to send the subscribe_ok message to the subscriber
      let subscribe_ok =
        moqtail::model::control::subscribe_ok::SubscribeOk::new_ascending_with_content(
          sub_request.original_request_id,
          msg.expires,
          msg.largest_location,
          None,
        );
      // send the subscribe_ok message to the subscriber
      let subscriber = {
        let mngr = context.client_manager.read().await;
        mngr.get(sub_request.requested_by).await
      };

      if subscriber.is_none() {
        warn!("subscriber not found");
        return Ok(());
      }

      debug!("subscriber found: {:?}", sub_request.requested_by);
      let subscriber = subscriber.unwrap();

      info!(
        "sending SubscribeOk to subscriber: {:?}, msg: {:?}",
        sub_request.requested_by, &subscribe_ok
      );

      subscriber
        .queue_message(ControlMessage::SubscribeOk(Box::new(subscribe_ok)))
        .await;
      drop(subscriber);

      /*
      TODO: do we need to update the subscription with the incoming subscribe_ok message?
      */

      // remove the request from the publisher
      debug!("removing request from publisher: {:?}", request_id);

      // add the track to the subscribed tracks
      info!(
        "adding track to subscribed tracks: {:?}",
        sub_request.subscribe_request.track_alias
      );
      Ok(())
    }
    ControlMessage::Unsubscribe(m) => {
      info!("received Unsubscribe message: {:?}", m);
      // stop sending objects for the track for the subscriber
      // by removing the subscription

      // get the client
      let client = context.get_client().await;
      let client = match client {
        Some(c) => c,
        None => {
          warn!(
            "client not found for connection id: {:?}",
            context.connection_id
          );
          return Err(TerminationCode::InternalError);
        }
      };

      // find the track alias by using the request id
      let requests = client.subscribe_requests.read().await;
      let request = requests.get(&m.request_id);
      if request.is_none() {
        // a warning is enough
        warn!("request not found for request id: {:?}", m.request_id);
        return Ok(());
      }
      let request = request.unwrap();
      let track_alias = request.subscribe_request.track_alias;

      // remove the subscription from the track
      let mut tracks = context.tracks.write().await;
      let track = tracks.get_mut(&track_alias).unwrap();
      track.remove_subscription(context.connection_id).await;
      drop(tracks);
      Ok(())
    }
    _ => {
      // no-op
      Ok(())
    }
  }
}
