use bytes::{BufMut, Bytes, BytesMut};

use super::control_message::ControlMessageTrait;
use crate::model::common::tuple::Tuple;
use crate::model::common::varint::BufMutVarIntExt;
use crate::model::control::constant::ControlMessageType;
use crate::model::error::ParseError;

#[derive(Debug, Clone, PartialEq)]
pub struct Unannounce {
  pub track_namespace: Tuple,
}
impl Unannounce {
  pub fn new(track_namespace: Tuple) -> Self {
    Unannounce { track_namespace }
  }
}
impl ControlMessageTrait for Unannounce {
  fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();
    buf.put_vi(ControlMessageType::Unannounce)?;

    let mut payload = BytesMut::new();
    payload.extend_from_slice(&self.track_namespace.serialize()?);

    let payload_len: u16 = payload
      .len()
      .try_into()
      .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
        context: "Unannounce::serialize(payload_length)",
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
    Ok(Box::new(Unannounce { track_namespace }))
  }

  fn get_type(&self) -> ControlMessageType {
    ControlMessageType::Unannounce
  }
}

#[cfg(test)]
mod tests {
  use crate::model::common::varint::BufVarIntExt;

  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let track_namespace = Tuple::from_utf8_path("un/announce/me");
    let unannounce = Unannounce { track_namespace };
    let mut buf = unannounce.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::Unannounce as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());
    let deserialized = Unannounce::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, unannounce);
    assert!(!buf.has_remaining());
  }

  #[test]
  fn test_excess_roundtrip() {
    let track_namespace = Tuple::from_utf8_path("un/announce/me");
    let unannounce = Unannounce { track_namespace };

    let serialized = unannounce.serialize().unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::Unannounce as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining() - 3);
    let deserialized = Unannounce::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, unannounce);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let track_namespace = Tuple::from_utf8_path("un/announce/me");
    let unannounce = Unannounce { track_namespace };
    let mut buf = unannounce.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::Unannounce as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());
    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = Unannounce::parse_payload(&mut partial);
    assert!(deserialized.is_err());
  }
}
