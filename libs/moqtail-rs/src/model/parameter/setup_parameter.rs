use crate::model::{
  common::varint::{BufMutVarIntExt, BufVarIntExt},
  error::ParseError,
  parameter::constant::SetupParameterType,
};
use bytes::{Buf, Bytes, BytesMut};
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SetupParameter {
  Path { moqt_path: String },
  MaxRequestId { max_id: u64 },
  MaxAuthTokenCacheSize { max_size: u64 },
}
impl SetupParameter {
  pub fn new_path(moqt_path: String) -> Self {
    SetupParameter::Path { moqt_path }
  }

  pub fn new_max_request_id(max_id: u64) -> Self {
    SetupParameter::MaxRequestId { max_id }
  }

  pub fn new_max_auth_token_cache_size(max_size: u64) -> Self {
    SetupParameter::MaxAuthTokenCacheSize { max_size }
  }

  pub fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();
    match self {
      Self::Path { moqt_path } => {
        buf.put_vi(SetupParameterType::Path as u64)?;
        let data = moqt_path.as_bytes();
        buf.put_vi(data.len() as u64)?;
        buf.extend_from_slice(data);
      }
      Self::MaxRequestId { max_id } => {
        buf.put_vi(SetupParameterType::MaxRequestId as u64)?;
        buf.put_vi(*max_id)?;
      }
      Self::MaxAuthTokenCacheSize { max_size } => {
        buf.put_vi(SetupParameterType::MaxAuthTokenCacheSize as u64)?;
        buf.put_vi(*max_size)?;
      }
    }
    Ok(buf.freeze())
  }
  pub fn deserialize(bytes: &mut Bytes) -> Result<SetupParameter, ParseError> {
    let ptype = bytes.get_vi()?;
    let ptype = SetupParameterType::try_from(ptype)?;

    match ptype {
      SetupParameterType::Path => {
        let len = bytes.get_vi()?;
        let len: usize =
          len
            .try_into()
            .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
              context: "SetupParameter::deserialize",
              from_type: "u64",
              to_type: "usize",
              details: e.to_string(),
            })?;
        if bytes.remaining() < len {
          return Err(ParseError::NotEnoughBytes {
            context: "SetupParameter::deserialize",
            needed: len,
            available: bytes.remaining(),
          });
        }
        let raw = bytes.copy_to_bytes(len);
        let moqt_path = String::from_utf8(raw.to_vec()).map_err(|e| ParseError::InvalidUTF8 {
          context: "SetupParameter::deserialize",
          details: e.to_string(),
        })?;
        Ok(SetupParameter::Path { moqt_path })
      }
      SetupParameterType::MaxRequestId => {
        let max_id = bytes.get_vi()?;
        Ok(SetupParameter::MaxRequestId { max_id })
      }
      SetupParameterType::MaxAuthTokenCacheSize => {
        let max_size = bytes.get_vi()?;
        Ok(SetupParameter::MaxAuthTokenCacheSize { max_size })
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::SetupParameter;
  use crate::model::{common::varint::BufMutVarIntExt, parameter::constant::SetupParameterType};
  use bytes::{Buf, BytesMut};

  #[test]
  fn test_roundtrip_path() {
    let orig = SetupParameter::new_path("test/path".to_string());
    let mut buf = orig.serialize().unwrap();
    let got = SetupParameter::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_roundtrip_empty_path() {
    let orig = SetupParameter::new_path(String::new());
    let mut buf = orig.serialize().unwrap();
    let got = SetupParameter::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_roundtrip_max_request_id() {
    let orig = SetupParameter::new_max_request_id(0xDEAD_BEEFu64);
    let mut buf = orig.serialize().unwrap();
    let got = SetupParameter::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_roundtrip_max_auth_cache_size() {
    let orig = SetupParameter::new_max_auth_token_cache_size(123456);
    let mut buf = orig.serialize().unwrap();
    let got = SetupParameter::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_deserialize_invalid_type() {
    let mut buf = BytesMut::new();
    buf.put_vi(999u64).unwrap(); // unknown tag
    let mut bytes = buf.freeze();
    let err = SetupParameter::deserialize(&mut bytes);
    assert!(err.is_err())
  }

  #[test]
  fn test_deserialize_path_missing_length() {
    let mut buf = BytesMut::new();
    buf.put_vi(SetupParameterType::Path as u64).unwrap();
    // no length, no data
    let mut bytes = buf.freeze();
    let err = SetupParameter::deserialize(&mut bytes);
    assert!(err.is_err())
  }

  #[test]
  fn test_deserialize_path_insufficient_data() {
    let mut buf = BytesMut::new();
    buf.put_vi(SetupParameterType::Path as u64).unwrap();
    buf.put_vi(5).unwrap(); // declare 5 bytes
    buf.extend_from_slice(b"abc"); // only 3 bytes
    let mut bytes = buf.freeze();
    let err = SetupParameter::deserialize(&mut bytes);
    assert!(err.is_err())
  }

  #[test]
  fn test_deserialize_max_request_id_missing_value() {
    let mut buf = BytesMut::new();
    buf.put_vi(SetupParameterType::MaxRequestId as u64).unwrap();
    // no ID varint
    let mut bytes = buf.freeze();
    let err = SetupParameter::deserialize(&mut bytes);
    assert!(err.is_err())
  }

  #[test]
  fn test_deserialize_max_auth_cache_missing_value() {
    let mut buf = BytesMut::new();
    buf
      .put_vi(SetupParameterType::MaxAuthTokenCacheSize as u64)
      .unwrap();
    // no size varint
    let mut bytes = buf.freeze();
    let err = SetupParameter::deserialize(&mut bytes);
    assert!(err.is_err())
  }

  #[test]
  fn test_excess_bytes_after_path() {
    let orig = SetupParameter::new_path("ok".to_string());
    let mut buf = BytesMut::from(&orig.serialize().unwrap()[..]);
    buf.extend_from_slice(b"XYZ");
    let mut bytes = buf.freeze();
    let got = SetupParameter::deserialize(&mut bytes).unwrap();
    assert_eq!(got, orig);
    assert_eq!(bytes.remaining(), 3);
    assert_eq!(&bytes[..], b"XYZ");
  }

  #[test]
  fn test_excess_bytes_after_max_request_id() {
    let orig = SetupParameter::new_max_request_id(42);
    let mut buf = BytesMut::from(&orig.serialize().unwrap()[..]);
    buf.extend_from_slice(&[0xFF, 0xEE]);
    let mut bytes = buf.freeze();
    let got = SetupParameter::deserialize(&mut bytes).unwrap();
    assert_eq!(got, orig);
    assert_eq!(bytes.remaining(), 2);
    assert_eq!(&bytes[..], &[0xFF, 0xEE]);
  }

  #[test]
  fn test_excess_bytes_after_max_auth_cache() {
    let orig = SetupParameter::new_max_auth_token_cache_size(7);
    let mut buf = BytesMut::from(&orig.serialize().unwrap()[..]);
    buf.extend_from_slice(&[1, 2, 3]);
    let mut bytes = buf.freeze();
    let got = SetupParameter::deserialize(&mut bytes).unwrap();
    assert_eq!(got, orig);
    assert_eq!(bytes.remaining(), 3);
    assert_eq!(&bytes[..], &[1, 2, 3]);
  }
}
