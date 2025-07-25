use bytes::{BufMut, Bytes, BytesMut};

use super::constant::AnnounceErrorCode;

use crate::model::common::reason_phrase::ReasonPhrase;

use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::control::constant::ControlMessageType;
use crate::model::control::control_message::ControlMessageTrait;
use crate::model::error::ParseError;

#[derive(Debug, Clone, PartialEq)]

pub struct AnnounceError {
  pub request_id: u64,
  pub error_code: AnnounceErrorCode,
  pub reason_phrase: ReasonPhrase,
}
impl AnnounceError {
  pub fn new(request_id: u64, error_code: AnnounceErrorCode, reason_phrase: ReasonPhrase) -> Self {
    AnnounceError {
      request_id,
      error_code,
      reason_phrase,
    }
  }
}

impl ControlMessageTrait for AnnounceError {
  fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();
    buf.put_vi(ControlMessageType::AnnounceError)?;

    let mut payload = BytesMut::new();
    payload.put_vi(self.request_id)?;
    payload.put_vi(self.error_code)?;
    payload.extend_from_slice(&self.reason_phrase.serialize()?);

    let payload_len: u16 = payload
      .len()
      .try_into()
      .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
        context: "AnnounceError::serialize(payload_length)",
        from_type: "usize",
        to_type: "u16",
        details: e.to_string(),
      })?;
    buf.put_u16(payload_len);
    buf.extend_from_slice(&payload);

    Ok(buf.freeze())
  }

  fn parse_payload(payload: &mut Bytes) -> Result<Box<Self>, ParseError> {
    let request_id = payload.get_vi()?;

    let error_code_raw = payload.get_vi()?;
    let error_code = AnnounceErrorCode::try_from(error_code_raw)?;

    let reason_phrase = ReasonPhrase::deserialize(payload)?;

    Ok(Box::new(AnnounceError {
      request_id,
      error_code,
      reason_phrase,
    }))
  }

  fn get_type(&self) -> ControlMessageType {
    ControlMessageType::AnnounceError
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let request_id = 12345;
    let error_code = AnnounceErrorCode::ExpiredAuthToken;
    let reason_phrase = ReasonPhrase::try_new("tis I sir lancelot of camelot".to_string()).unwrap();
    let announce_error = AnnounceError::new(request_id, error_code, reason_phrase.clone());

    let mut buf = announce_error.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::AnnounceError as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());
    let deserialized = AnnounceError::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, announce_error);
    assert!(!buf.has_remaining());
  }

  #[test]
  fn test_excess_roundtrip() {
    let request_id = 67890;
    let error_code = AnnounceErrorCode::InternalError;
    let reason_phrase = ReasonPhrase::try_new("wake me up".to_string()).unwrap();
    let announce_error = AnnounceError::new(request_id, error_code, reason_phrase.clone());

    let serialized = announce_error.serialize().unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();

    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::AnnounceError as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining() - 3);
    let deserialized = AnnounceError::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, announce_error);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let request_id = 112233;
    let error_code = AnnounceErrorCode::MalformedAuthToken;
    let reason_phrase = ReasonPhrase::try_new("Uvuvwevwevwe".to_string()).unwrap();
    let announce_error = AnnounceError::new(request_id, error_code, reason_phrase.clone());

    let mut buf = announce_error.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::AnnounceError as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());

    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = AnnounceError::parse_payload(&mut partial);
    assert!(deserialized.is_err());
  }
}
