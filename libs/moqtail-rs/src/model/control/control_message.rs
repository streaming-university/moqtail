use crate::model::common::varint::BufVarIntExt;
use crate::model::error::ParseError;
use bytes::{Buf, Bytes};

use super::{
  announce::Announce, announce_cancel::AnnounceCancel, announce_error::AnnounceError,
  announce_ok::AnnounceOk, client_setup::ClientSetup, constant::ControlMessageType, fetch::Fetch,
  fetch_cancel::FetchCancel, fetch_error::FetchError, fetch_ok::FetchOk, goaway::GoAway,
  max_request_id::MaxRequestId, requests_blocked::RequestsBlocked, server_setup::ServerSetup,
  subscribe::Subscribe, subscribe_announces::SubscribeAnnounces,
  subscribe_announces_error::SubscribeAnnouncesError, subscribe_announces_ok::SubscribeAnnouncesOk,
  subscribe_done::SubscribeDone, subscribe_error::SubscribeError, subscribe_ok::SubscribeOk,
  subscribe_update::SubscribeUpdate, track_status::TrackStatus,
  track_status_request::TrackStatusRequest, unannounce::Unannounce, unsubscribe::Unsubscribe,
  unsubscribe_announces::UnsubscribeAnnounces,
};

#[derive(Debug, Clone, PartialEq)]
pub enum ControlMessage {
  Announce(Box<Announce>),
  AnnounceCancel(Box<AnnounceCancel>),
  AnnounceError(Box<AnnounceError>),
  AnnounceOk(Box<AnnounceOk>),
  ClientSetup(Box<ClientSetup>),
  Fetch(Box<Fetch>),
  FetchCancel(Box<FetchCancel>),
  FetchError(Box<FetchError>),
  FetchOk(Box<FetchOk>),
  Goaway(Box<GoAway>),
  MaxRequestId(Box<MaxRequestId>),
  ServerSetup(Box<ServerSetup>),
  Subscribe(Box<Subscribe>),
  SubscribeDone(Box<SubscribeDone>),
  SubscribeError(Box<SubscribeError>),
  SubscribeOk(Box<SubscribeOk>),
  SubscribeUpdate(Box<SubscribeUpdate>),
  RequestsBlocked(Box<RequestsBlocked>),
  TrackStatus(Box<TrackStatus>),
  TrackStatusRequest(Box<TrackStatusRequest>),
  Unannounce(Box<Unannounce>),
  Unsubscribe(Box<Unsubscribe>),
  SubscribeAnnounces(Box<SubscribeAnnounces>),
  SubscribeAnnouncesOk(Box<SubscribeAnnouncesOk>),
  SubscribeAnnouncesError(Box<SubscribeAnnouncesError>),
  UnsubscribeAnnounces(Box<UnsubscribeAnnounces>),
}

pub trait ControlMessageTrait: std::fmt::Debug {
  fn serialize(&self) -> Result<Bytes, ParseError>;
  fn parse_payload(payload: &mut Bytes) -> Result<Box<Self>, ParseError>
  where
    Self: Sized;
  fn get_type(&self) -> ControlMessageType;
}

impl ControlMessage {
  pub fn deserialize(bytes: &mut Bytes) -> Result<Self, ParseError> {
    let message_type = bytes.get_vi()?;
    let msg_type = ControlMessageType::try_from(message_type)?;

    if bytes.remaining() < 2 {
      return Err(ParseError::NotEnoughBytes {
        context: "ControlMessage::deserialize(payload_length)",
        needed: 2,
        available: 0,
      });
    }
    let payload_length = bytes.get_u16() as usize;

    if bytes.remaining() < payload_length {
      return Err(ParseError::NotEnoughBytes {
        context: "ControlMessage::deserialize(payload_length)",
        needed: payload_length,
        available: bytes.remaining(),
      });
    }

    let mut payload = bytes.copy_to_bytes(payload_length);
    let message = match msg_type {
      ControlMessageType::ReservedClientSetupV10 => {
        unimplemented!()
      }
      ControlMessageType::ReservedServerSetupV10 => {
        unimplemented!()
      }
      ControlMessageType::ReservedSetupV00 => {
        unimplemented!()
      }
      ControlMessageType::Announce => {
        Announce::parse_payload(&mut payload).map(ControlMessage::Announce)
      }
      ControlMessageType::AnnounceCancel => {
        AnnounceCancel::parse_payload(&mut payload).map(ControlMessage::AnnounceCancel)
      }
      ControlMessageType::AnnounceError => {
        AnnounceError::parse_payload(&mut payload).map(ControlMessage::AnnounceError)
      }
      ControlMessageType::AnnounceOk => {
        AnnounceOk::parse_payload(&mut payload).map(ControlMessage::AnnounceOk)
      }
      ControlMessageType::ClientSetup => {
        ClientSetup::parse_payload(&mut payload).map(ControlMessage::ClientSetup)
      }
      ControlMessageType::Fetch => Fetch::parse_payload(&mut payload).map(ControlMessage::Fetch),
      ControlMessageType::FetchCancel => {
        FetchCancel::parse_payload(&mut payload).map(ControlMessage::FetchCancel)
      }
      ControlMessageType::FetchError => {
        FetchError::parse_payload(&mut payload).map(ControlMessage::FetchError)
      }
      ControlMessageType::FetchOk => {
        FetchOk::parse_payload(&mut payload).map(ControlMessage::FetchOk)
      }
      ControlMessageType::GoAway => GoAway::parse_payload(&mut payload).map(ControlMessage::Goaway),
      ControlMessageType::MaxRequestId => {
        MaxRequestId::parse_payload(&mut payload).map(ControlMessage::MaxRequestId)
      }
      ControlMessageType::ServerSetup => {
        ServerSetup::parse_payload(&mut payload).map(ControlMessage::ServerSetup)
      }
      ControlMessageType::Subscribe => {
        Subscribe::parse_payload(&mut payload).map(ControlMessage::Subscribe)
      }
      ControlMessageType::SubscribeDone => {
        SubscribeDone::parse_payload(&mut payload).map(ControlMessage::SubscribeDone)
      }
      ControlMessageType::SubscribeError => {
        SubscribeError::parse_payload(&mut payload).map(ControlMessage::SubscribeError)
      }
      ControlMessageType::SubscribeOk => {
        SubscribeOk::parse_payload(&mut payload).map(ControlMessage::SubscribeOk)
      }
      ControlMessageType::SubscribeUpdate => {
        SubscribeUpdate::parse_payload(&mut payload).map(ControlMessage::SubscribeUpdate)
      }
      ControlMessageType::RequestsBlocked => {
        RequestsBlocked::parse_payload(&mut payload).map(ControlMessage::RequestsBlocked)
      }
      ControlMessageType::TrackStatus => {
        TrackStatus::parse_payload(&mut payload).map(ControlMessage::TrackStatus)
      }
      ControlMessageType::TrackStatusRequest => {
        TrackStatusRequest::parse_payload(&mut payload).map(ControlMessage::TrackStatusRequest)
      }
      ControlMessageType::Unannounce => {
        Unannounce::parse_payload(&mut payload).map(ControlMessage::Unannounce)
      }
      ControlMessageType::Unsubscribe => {
        Unsubscribe::parse_payload(&mut payload).map(ControlMessage::Unsubscribe)
      }
      ControlMessageType::SubscribeAnnounces => {
        SubscribeAnnounces::parse_payload(&mut payload).map(ControlMessage::SubscribeAnnounces)
      }
      ControlMessageType::SubscribeAnnouncesOk => {
        SubscribeAnnouncesOk::parse_payload(&mut payload).map(ControlMessage::SubscribeAnnouncesOk)
      }
      ControlMessageType::SubscribeAnnouncesError => {
        SubscribeAnnouncesError::parse_payload(&mut payload)
          .map(ControlMessage::SubscribeAnnouncesError)
      }
      ControlMessageType::UnsubscribeAnnounces => {
        UnsubscribeAnnounces::parse_payload(&mut payload).map(ControlMessage::UnsubscribeAnnounces)
      }
    }
    .map_err(|err| ParseError::ProcotolViolation {
      context: "ControlMessage::deserialize(payload)",
      details: err.to_string(),
    })?;

    if payload.has_remaining() {
      return Err(ParseError::ProcotolViolation {
        context: "ControlMessage::deserialize(final_check)",
        details: format!(
          "Extra {} bytes remaining in payload after parsing",
          payload.remaining()
        ),
      });
    };
    Ok(message)
  }

  pub fn serialize(&self) -> Result<Bytes, ParseError> {
    match self {
      ControlMessage::Announce(msg) => msg.serialize(),
      ControlMessage::AnnounceCancel(msg) => msg.serialize(),
      ControlMessage::AnnounceError(msg) => msg.serialize(),
      ControlMessage::AnnounceOk(msg) => msg.serialize(),
      ControlMessage::ClientSetup(msg) => msg.serialize(),
      ControlMessage::Fetch(msg) => msg.serialize(),
      ControlMessage::FetchCancel(msg) => msg.serialize(),
      ControlMessage::FetchError(msg) => msg.serialize(),
      ControlMessage::FetchOk(msg) => msg.serialize(),
      ControlMessage::Goaway(msg) => msg.serialize(),
      ControlMessage::MaxRequestId(msg) => msg.serialize(),
      ControlMessage::ServerSetup(msg) => msg.serialize(),
      ControlMessage::Subscribe(msg) => msg.serialize(),
      ControlMessage::SubscribeDone(msg) => msg.serialize(),
      ControlMessage::SubscribeError(msg) => msg.serialize(),
      ControlMessage::SubscribeOk(msg) => msg.serialize(),
      ControlMessage::SubscribeUpdate(msg) => msg.serialize(),
      ControlMessage::RequestsBlocked(msg) => msg.serialize(),
      ControlMessage::TrackStatus(msg) => msg.serialize(),
      ControlMessage::TrackStatusRequest(msg) => msg.serialize(),
      ControlMessage::Unannounce(msg) => msg.serialize(),
      ControlMessage::Unsubscribe(msg) => msg.serialize(),
      ControlMessage::SubscribeAnnounces(msg) => msg.serialize(),
      ControlMessage::SubscribeAnnouncesOk(msg) => msg.serialize(),
      ControlMessage::SubscribeAnnouncesError(msg) => msg.serialize(),
      ControlMessage::UnsubscribeAnnounces(msg) => msg.serialize(),
    }
  }

  /// Returns the message type of the control message.
  pub fn get_type(&self) -> ControlMessageType {
    match self {
      ControlMessage::Announce(_) => ControlMessageType::Announce,
      ControlMessage::AnnounceCancel(_) => ControlMessageType::AnnounceCancel,
      ControlMessage::AnnounceError(_) => ControlMessageType::AnnounceError,
      ControlMessage::AnnounceOk(_) => ControlMessageType::AnnounceOk,
      ControlMessage::ClientSetup(_) => ControlMessageType::ClientSetup,
      ControlMessage::Fetch(_) => ControlMessageType::Fetch,
      ControlMessage::FetchCancel(_) => ControlMessageType::FetchCancel,
      ControlMessage::FetchError(_) => ControlMessageType::FetchError,
      ControlMessage::FetchOk(_) => ControlMessageType::FetchOk,
      ControlMessage::Goaway(_) => ControlMessageType::GoAway,
      ControlMessage::MaxRequestId(_) => ControlMessageType::MaxRequestId,
      ControlMessage::ServerSetup(_) => ControlMessageType::ServerSetup,
      ControlMessage::Subscribe(_) => ControlMessageType::Subscribe,
      ControlMessage::SubscribeDone(_) => ControlMessageType::SubscribeDone,
      ControlMessage::SubscribeError(_) => ControlMessageType::SubscribeError,
      ControlMessage::SubscribeOk(_) => ControlMessageType::SubscribeOk,
      ControlMessage::SubscribeUpdate(_) => ControlMessageType::SubscribeUpdate,
      ControlMessage::RequestsBlocked(_) => ControlMessageType::RequestsBlocked,
      ControlMessage::TrackStatus(_) => ControlMessageType::TrackStatus,
      ControlMessage::TrackStatusRequest(_) => ControlMessageType::TrackStatusRequest,
      ControlMessage::Unannounce(_) => ControlMessageType::Unannounce,
      ControlMessage::Unsubscribe(_) => ControlMessageType::Unsubscribe,
      ControlMessage::SubscribeAnnounces(_) => ControlMessageType::SubscribeAnnounces,
      ControlMessage::SubscribeAnnouncesOk(_) => ControlMessageType::SubscribeAnnouncesOk,
      ControlMessage::SubscribeAnnouncesError(_) => ControlMessageType::SubscribeAnnouncesError,
      ControlMessage::UnsubscribeAnnounces(_) => ControlMessageType::UnsubscribeAnnounces,
    }
  }
}

#[cfg(test)]
mod tests {
  use crate::model::common::{pair::KeyValuePair, tuple::Tuple};

  use super::*;

  #[test]
  fn test_announce_roundtrip() {
    let request_id = 12345;
    let track_namespace = Tuple::from_utf8_path("god/dayyum");
    let parameters = vec![
      KeyValuePair::try_new_varint(0, 10).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"wololoo")).unwrap(),
    ];
    let announce = Announce {
      request_id,
      track_namespace,
      parameters,
    };

    let mut buf = announce.serialize().unwrap();
    let deserialized = ControlMessage::deserialize(&mut buf).unwrap();
    if let ControlMessage::Announce(deserialized_announce) = deserialized {
      assert_eq!(*deserialized_announce, announce);
    } else {
      panic!("Expected ControlMessage::Announce variant");
    }
    assert!(!buf.has_remaining());
  }
}
