use bytes::{BufMut, Bytes, BytesMut};

use super::constant::AnnounceErrorCode;
use super::control_message::ControlMessageTrait;
use crate::model::common::reason_phrase::ReasonPhrase;
use crate::model::common::tuple::Tuple;
use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::control::constant::ControlMessageType;
use crate::model::error::ParseError;

#[derive(Debug, Clone, PartialEq)]
pub struct AnnounceCancel {
  pub track_namespace: Tuple,
  pub error_code: AnnounceErrorCode,
  pub reason_phrase: ReasonPhrase,
}
impl AnnounceCancel {
  pub fn new(
    track_namespace: Tuple,
    error_code: AnnounceErrorCode,
    reason_phrase: ReasonPhrase,
  ) -> Self {
    AnnounceCancel {
      track_namespace,
      error_code,
      reason_phrase,
    }
  }
}
impl ControlMessageTrait for AnnounceCancel {
  fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();
    buf.put_vi(ControlMessageType::AnnounceCancel)?;

    let mut payload = BytesMut::new();
    payload.extend_from_slice(&self.track_namespace.serialize()?);
    payload.put_vi(self.error_code)?;
    payload.extend_from_slice(&self.reason_phrase.serialize()?);

    let payload_len: u16 = payload
      .len()
      .try_into()
      .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
        context: "AnnounceCancel::serialize(payload_length)",
        from_type: "usize",
        to_type: "u16",
        details: e.to_string(),
      })?;
    buf.put_u16(payload_len);
    buf.extend_from_slice(&payload);
    Ok(buf.freeze())
  }

  fn parse_payload(payload: &mut Bytes) -> Result<Box<Self>, ParseError> {
    let track_namespace = Tuple::deserialize(payload)?;

    let error_code_raw = payload.get_vi()?;
    let error_code = AnnounceErrorCode::try_from(error_code_raw)?;
    let reason_phrase = ReasonPhrase::deserialize(payload)?;

    Ok(Box::new(AnnounceCancel {
      track_namespace,
      error_code,
      reason_phrase,
    }))
  }

  fn get_type(&self) -> ControlMessageType {
    ControlMessageType::AnnounceCancel
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use bytes::Buf;
  #[test]
  fn test_roundtrip() {
    let error_code = AnnounceErrorCode::ExpiredAuthToken;
    let reason_phrase = ReasonPhrase::try_new("why are you running?".to_string()).unwrap();
    let track_namespace = Tuple::from_utf8_path("valid/track/namespace");
    let sub_update = AnnounceCancel {
      error_code,
      reason_phrase,
      track_namespace,
    };
    let mut buf = sub_update.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::AnnounceCancel as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());
    let deserialized = AnnounceCancel::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, sub_update);
    assert!(!buf.has_remaining());
  }
  #[test]
  fn test_excess_roundtrip() {
    let error_code = AnnounceErrorCode::InternalError;
    let reason_phrase = ReasonPhrase::try_new("bomboclad".to_string()).unwrap();
    let track_namespace = Tuple::from_utf8_path("another/valid/track/namespace");
    let sub_update = AnnounceCancel {
      error_code,
      reason_phrase,
      track_namespace,
    };
    let serialized = sub_update.serialize().unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::AnnounceCancel as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining() - 3);
    let deserialized = AnnounceCancel::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, sub_update);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let error_code = AnnounceErrorCode::MalformedAuthToken;
    let reason_phrase = ReasonPhrase::try_new("Uvuvwevwevwe".to_string()).unwrap();
    let track_namespace = Tuple::from_utf8_path("Onyetenyevwe/Ugwemuhwem/Osas");
    let sub_update = AnnounceCancel {
      error_code,
      reason_phrase,
      track_namespace,
    };
    let mut buf = sub_update.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::AnnounceCancel as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());
    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = AnnounceCancel::parse_payload(&mut partial);
    assert!(deserialized.is_err());
  }
}
