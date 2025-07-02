use bytes::Bytes;
use moqtail::model::common::tuple::Tuple;
use moqtail::model::control::announce::Announce;
use moqtail::model::control::client_setup::ClientSetup;
use moqtail::model::control::constant::{self, GroupOrder};
use moqtail::model::control::control_message::ControlMessage;
use moqtail::model::control::subscribe::Subscribe;
use moqtail::model::control::subscribe_ok::SubscribeOk;
use moqtail::model::data::object::Object;
use moqtail::model::data::subgroup_header::SubgroupHeader;
use moqtail::model::data::subgroup_object::SubgroupObject;
use moqtail::transport::control_stream_handler::ControlStreamHandler;
use tokio::sync::{Mutex, RwLock};

use moqtail::transport::data_stream_handler::{HeaderInfo, RecvDataStream, SendDataStream};
use std::collections::BTreeMap;
use std::sync::Arc;
use tracing::error;
use tracing::info;
use wtransport::{ClientConfig, Endpoint};

pub(crate) struct Client {
  pub endpoint: String,
  pub is_publisher: bool,
  pub validate_cert: bool,
  control_stream_handler: Option<Arc<Mutex<ControlStreamHandler>>>,
}

impl Client {
  pub fn new(endpoint: String, is_publisher: bool, validate_cert: bool) -> Self {
    Client {
      endpoint,
      is_publisher,
      validate_cert,
      control_stream_handler: None,
    }
  }

  pub async fn run(&mut self) -> Result<(), anyhow::Error> {
    let endpoint = self.endpoint.clone();
    let is_publisher = self.is_publisher;
    let validate_cert = self.validate_cert;

    let c = ClientConfig::builder().with_bind_default();
    let config = if validate_cert {
      c.with_no_cert_validation().build()
    } else {
      c.with_native_certs().build()
    };

    let connection = Arc::new(
      Endpoint::client(config)
        .unwrap()
        .connect(endpoint.as_str())
        .await
        .unwrap(),
    );

    let (send_stream, recv_stream) = connection.open_bi().await.unwrap().await.unwrap();

    let mut control_stream_handler = ControlStreamHandler::new(send_stream, recv_stream);

    let client_setup = ClientSetup::new([constant::DRAFT_11].to_vec(), [].to_vec());

    match control_stream_handler.send_impl(&client_setup).await {
      Ok(_) => info!("Client setup sent successfully"),
      Err(e) => error!("Failed to send client setup: {:?}", e),
    }

    let server_setup = match control_stream_handler.next_message().await {
      Ok(ControlMessage::ServerSetup(m)) => m,
      Ok(m) => {
        error!("Unexpected message type: {:?}", m);
        return Err(anyhow::anyhow!("Unexpected message type: {:?}", m));
      }
      Err(e) => {
        error!("Failed to receive server setup: {:?}", e);
        return Err(anyhow::anyhow!("Failed to receive server setup: {:?}", e));
      }
    };

    info!("Received server setup: {:?}", server_setup);

    // compare the server setup with the client setup
    if server_setup.selected_version != constant::DRAFT_11 {
      error!(
        "Server setup version mismatch: expected {:0X}, got {}",
        constant::DRAFT_11,
        server_setup.selected_version
      );
      return Err(anyhow::anyhow!(
        "Server setup version mismatch: expected {:0X}, got {}",
        constant::DRAFT_11,
        server_setup.selected_version
      ));
    }

    self.control_stream_handler = Some(Arc::new(Mutex::new(control_stream_handler)));

    if is_publisher {
      self.start_publisher(connection.clone()).await;
    } else {
      self.start_subscriber(connection.clone()).await;
    }
    Ok(())
  }

  async fn start_publisher(&self, connection: Arc<wtransport::Connection>) {
    info!("Starting publisher...");

    let my_namespace = Tuple::from_utf8_path("moqtail");

    let request_id = 0;

    // start by sending an announce message
    self
      .send_announce_and_wait(request_id, my_namespace.clone())
      .await
      .unwrap();

    info!("Announce sent successfully");

    // wait for subscribe or fetch, enter loop
    loop {
      let message;
      {
        let control_stream_handler = self.control_stream_handler.clone().unwrap();
        let mut control = control_stream_handler.lock().await;
        message = control.next_message().await;
      }

      match message {
        Ok(ControlMessage::Subscribe(m)) => {
          info!("Received subscribe message: {:?}", m);
          // Handle the subscribe message
          // send Subscribe_ok
          self.send_subscribe_ok(m.request_id).await;

          // open a unidirectional stream
          let connection = connection.clone();
          tokio::spawn(async move {
            for group_id in 1..100 {
              info!("Opening unidirectional stream for group_id: {}", group_id);
              let stream = connection.open_uni().await.unwrap().await.unwrap();
              let sub_header =
                SubgroupHeader::new_with_explicit_id(m.track_alias, group_id, 1, 1, false);

              let header_info = HeaderInfo::Subgroup {
                header: sub_header,
                /*subscribe_request: *m.clone(),*/
              };
              let stream = Arc::new(Mutex::new(stream));
              let stream_handler = SendDataStream::new(stream.clone(), header_info).await;

              match stream_handler {
                Ok(mut handler) => {
                  for object_id in 1..10 {
                    info!("Sending object with id: {}", object_id);
                    let payload = format!(
                      "payload {}",
                      "x"
                        .to_string()
                        .repeat(object_id as usize)
                        .chars()
                        .collect::<String>()
                    );
                    let object = SubgroupObject {
                      object_id,
                      extension_headers: None,
                      object_status: None,
                      payload: Some(Bytes::from(payload)),
                    };
                    let object =
                      Object::try_from_subgroup(object, m.track_alias, group_id, Some(group_id), 1)
                        .unwrap();
                    match handler.send_object(&object).await {
                      Ok(_) => info!("Object sent successfully - object_id: {}", object_id),
                      Err(e) => error!("Failed to send object: {:?}", e),
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                  }
                  // TODO: normally, we need to finish the stream but the peer does not
                  // acknowledge it and we get stuck in the loop
                  handler.flush().await.unwrap();
                  info!("Unidirectional stream flushed for group_id: {}", group_id);
                  //handler.finish().await.unwrap();
                  //info!("Unidirectional stream finished for group_id: {}", group_id);
                }
                Err(e) => {
                  error!("Failed to open unidirectional stream: {:?}", e);
                }
              }
              tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
          });

          info!("Subscribe ok sent successfully");
        }
        Ok(ControlMessage::Unsubscribe(m)) => {
          info!("Received unsubscribe message: {:?}", m);
          // Handle the unsubscribe message
        }
        Ok(_) => {
          error!("Unexpected message type");
        }
        Err(e) => {
          error!("Failed to receive message: {:?}", e);
          break;
        }
      }
    }
  }

  async fn start_subscriber(&self, connection: Arc<wtransport::Connection>) {
    info!("Starting subscriber...");

    self.send_subscribe().await;
    info!("Subscribe sent successfully");

    // TODO: for this demo, we don't pass those
    let pending_fetches = Arc::new(RwLock::new(BTreeMap::new()));

    tokio::spawn(async move {
      loop {
        info!("Waiting for incoming unidirectional streams...");
        // listen for incoming unidirectional streams
        let stream = Arc::new(Mutex::new(connection.accept_uni().await.unwrap()));
        info!("Accepted unidirectional stream");

        let mut stream_handler = &RecvDataStream::new(stream.clone(), pending_fetches.clone());

        loop {
          let next = stream_handler.next_object().await;
          match next {
            (handler, Some(object)) => {
              info!("Received object: {:?}", object);
              // Handle the object
              stream_handler = handler;
            }
            (_, None) => {
              // error!("Failed to receive object: {:?}", e);
              info!("No more objects in the stream, closing...");
              break;
            }
          }
        }
      }
    });

    loop {
      let control_stream_handler = self.control_stream_handler.clone().unwrap();
      let mut control_stream_handler = control_stream_handler.lock().await;
      let message = control_stream_handler.next_message().await;
      match message {
        Ok(ControlMessage::SubscribeOk(m)) => {
          info!("Received SubscribeOk message: {:?}", m);
          // Handle the subscribe message
          // send Subscribe_ok
          // send_subscribe_ok(control_stream_handler, m.subscribe_id).await;
        }
        Ok(ControlMessage::Unsubscribe(m)) => {
          info!("Received unsubscribe message: {:?}", m);
          // Handle the unsubscribe message
        }
        Ok(_) => {
          error!("Unexpected message type");
        }
        Err(e) => {
          error!("Failed to receive message: {:?}", e);
          break;
        }
      }
    }
  }

  async fn send_subscribe(&self) -> Subscribe {
    let request_id = 0;
    let track_namespace = Tuple::from_utf8_path("/moqtail");
    let track_name = "demo".to_string();
    let subscriber_priority = 1;
    let group_order = GroupOrder::Ascending;
    let forward = true;
    let subscribe_parameters = vec![];
    let sub = Subscribe::new_latest_object(
      request_id,
      1,
      track_namespace,
      track_name,
      subscriber_priority,
      group_order,
      forward,
      subscribe_parameters,
    );
    let control_stream_handler = self.control_stream_handler.clone().unwrap();
    let mut control_stream_handler = control_stream_handler.lock().await;
    control_stream_handler.send_impl(&sub).await.unwrap();
    sub
  }

  async fn send_subscribe_ok(&self, request_id: u64) {
    info!("Sending SubscribeOk message");
    let control_stream_handler = self.control_stream_handler.clone().unwrap();
    let mut control_stream_handler = control_stream_handler.lock().await;
    info!("Control stream handler locked");
    let msg = SubscribeOk::new_ascending_with_content(request_id, 0, None, None);
    control_stream_handler.send_impl(&msg).await.unwrap();
    info!("SubscribeOk message sent successfully");
  }

  async fn send_announce_and_wait(
    &self,
    request_id: u64,
    my_namespace: Tuple,
  ) -> Result<(), anyhow::Error> {
    let control_stream_handler = self.control_stream_handler.clone().unwrap();
    let mut control_stream_handler = control_stream_handler.lock().await;
    // send announce, request id 0
    let announce = Announce::new(request_id, my_namespace, &[]);
    control_stream_handler.send_impl(&announce).await.unwrap();

    let announce_ok = control_stream_handler.next_message().await;
    match announce_ok {
      Ok(ControlMessage::AnnounceOk(m)) => {
        info!("Received announce ok message: {:?}", m);
        Ok(())
      }
      Ok(_) => {
        error!("Expecting announce ok message");
        Err(anyhow::anyhow!("Expecting announce ok message"))
      }
      Err(e) => {
        // TODO: request id mismatch should be handled in control stream handler
        error!("Failed to receive message: {:?}", e);
        Err(anyhow::anyhow!("Failed to receive message: {:?}", e))
      }
    }
  }
}
