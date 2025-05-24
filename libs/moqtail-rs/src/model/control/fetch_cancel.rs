use super::control_message::ControlMessageTrait;
use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::control::constant::ControlMessageType;
use crate::model::error::ParseError;
use bytes::{BufMut, Bytes, BytesMut};

#[derive(Debug, PartialEq, Clone)]
pub struct FetchCancel {
  pub request_id: u64,
}

impl FetchCancel {
  pub fn new(subscribe_id: u64) -> Self {
    Self {
      request_id: subscribe_id,
    }
  }
}

impl ControlMessageTrait for FetchCancel {
  fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();
    buf.put_vi(ControlMessageType::FetchCancel)?;

    let mut payload = BytesMut::new();
    payload.put_vi(self.request_id)?;

    let payload_len: u16 = payload
      .len()
      .try_into()
      .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
        context: "FetchCancel::serialize(payload_length)",
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
    Ok(Box::new(FetchCancel { request_id }))
  }

  fn get_type(&self) -> ControlMessageType {
    ControlMessageType::FetchCancel
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let request_id = 314159;
    let fetch_cancel = FetchCancel { request_id };
    let mut buf = fetch_cancel.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::FetchCancel as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());
    let deserialized = FetchCancel::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, fetch_cancel);
    assert!(!buf.has_remaining());
  }

  #[test]
  fn test_excess_roundtrip() {
    let request_id = 314159;
    let fetch_cancel = FetchCancel { request_id };

    let serialized = fetch_cancel.serialize().unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();

    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::FetchCancel as u64);
    let msg_length = buf.get_u16();

    assert_eq!(msg_length as usize, buf.remaining() - 3);
    let deserialized = FetchCancel::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, fetch_cancel);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let request_id = 314159;
    let fetch_cancel = FetchCancel { request_id };
    let mut buf = fetch_cancel.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::FetchCancel as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());

    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = FetchCancel::parse_payload(&mut partial);
    assert!(deserialized.is_err());
  }
}
