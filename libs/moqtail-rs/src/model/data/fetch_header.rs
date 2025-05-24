use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::error::ParseError;
use bytes::{Bytes, BytesMut};

use super::constant::FetchHeaderType;

#[derive(Debug, Clone, PartialEq, Copy)]
pub struct FetchHeader {
  pub request_id: u64,
}

impl FetchHeader {
  pub fn new(request_id: u64) -> Self {
    Self { request_id }
  }

  pub fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();
    buf.put_vi(FetchHeaderType::Type0x05 as u8)?;
    buf.put_vi(self.request_id)?;
    Ok(buf.freeze())
  }

  pub fn deserialize(bytes: &mut Bytes) -> Result<Self, ParseError> {
    let _ = bytes.get_vi();
    let request_id = bytes.get_vi()?;
    Ok(FetchHeader { request_id })
  }
}

#[cfg(test)]
mod tests {

  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let request_id = 144;
    let fetch_header = FetchHeader { request_id };

    let mut buf = fetch_header.serialize().unwrap();
    let deserialized = FetchHeader::deserialize(&mut buf).unwrap();
    assert_eq!(deserialized, fetch_header);
    assert!(!buf.has_remaining());
  }

  #[test]
  fn test_excess_roundtrip() {
    let request_id = 144;
    let fetch_header = FetchHeader { request_id };

    let serialized = fetch_header.serialize().unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();

    let deserialized = FetchHeader::deserialize(&mut buf).unwrap();
    assert_eq!(deserialized, fetch_header);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let request_id = 144;
    let fetch_header = FetchHeader { request_id };
    let buf = fetch_header.serialize().unwrap();
    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = FetchHeader::deserialize(&mut partial);
    assert!(deserialized.is_err());
  }
}
