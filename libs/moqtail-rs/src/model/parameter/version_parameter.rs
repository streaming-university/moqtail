use crate::model::{
  common::varint::BufMutVarIntExt,
  error::ParseError,
  parameter::constant::{TokenAliasType, VersionSpecificParameterType},
};

use bytes::{Buf, Bytes, BytesMut};

use crate::model::common::varint::BufVarIntExt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VersionParameter {
  MaxCacheDuration {
    duration: u64,
  },
  DeliveryTimeout {
    object_timeout: u64,
  },
  AuthorizationToken {
    alias_type: u64,
    token_alias: Option<u64>,
    token_type: Option<u64>,
    token_value: Option<Bytes>,
  },
}

impl VersionParameter {
  pub fn new_max_cache_duration(duration: u64) -> Self {
    VersionParameter::MaxCacheDuration { duration }
  }

  pub fn new_delivery_timeout(object_timeout: u64) -> Self {
    VersionParameter::DeliveryTimeout { object_timeout }
  }

  pub fn new_auth_token_delete(token_alias: u64) -> Self {
    VersionParameter::AuthorizationToken {
      alias_type: TokenAliasType::Delete as u64,
      token_alias: Some(token_alias),
      token_type: None,
      token_value: None,
    }
  }

  pub fn new_auth_token_register(token_alias: u64, token_type: u64, token_value: Bytes) -> Self {
    VersionParameter::AuthorizationToken {
      alias_type: TokenAliasType::Register as u64,
      token_alias: Some(token_alias),
      token_type: Some(token_type),
      token_value: Some(token_value),
    }
  }

  pub fn new_auth_token_use_alias(token_alias: u64) -> Self {
    VersionParameter::AuthorizationToken {
      alias_type: TokenAliasType::UseAlias as u64,
      token_alias: Some(token_alias),
      token_type: None,
      token_value: None,
    }
  }

  pub fn new_auth_token_use_value(token_type: u64, token_value: Bytes) -> Self {
    VersionParameter::AuthorizationToken {
      alias_type: TokenAliasType::UseValue as u64,
      token_alias: None,
      token_type: Some(token_type),
      token_value: Some(token_value),
    }
  }

  pub fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut bytes = BytesMut::new();
    match self {
      VersionParameter::MaxCacheDuration { duration } => {
        bytes.put_vi(VersionSpecificParameterType::MaxCacheDuration)?;
        bytes.put_vi(*duration)?;
      }
      VersionParameter::DeliveryTimeout { object_timeout } => {
        bytes.put_vi(VersionSpecificParameterType::DeliveryTimeout)?;
        bytes.put_vi(*object_timeout)?;
      }
      VersionParameter::AuthorizationToken {
        alias_type,
        token_alias,
        token_type,
        token_value,
      } => {
        bytes.put_vi(VersionSpecificParameterType::AuthorizationToken)?;
        let mut payload = BytesMut::new();
        payload.put_vi(*alias_type)?;
        if let Some(token_alias) = token_alias {
          payload.put_vi(*token_alias)?;
        }
        if let Some(token_type) = token_type {
          payload.put_vi(*token_type)?;
        }
        if let Some(token_value) = token_value {
          payload.extend_from_slice(token_value);
        }
        bytes.put_vi(payload.len())?;
        bytes.extend_from_slice(&payload);
      }
    }
    Ok(bytes.freeze())
  }

  pub fn deserialize(bytes: &mut Bytes) -> Result<VersionParameter, ParseError> {
    let param_type = bytes.get_vi()?;
    let param_type = VersionSpecificParameterType::try_from(param_type)?;
    match param_type {
      VersionSpecificParameterType::MaxCacheDuration => {
        let duration = bytes.get_vi()?;
        Ok(VersionParameter::MaxCacheDuration { duration })
      }
      VersionSpecificParameterType::DeliveryTimeout => {
        let object_timeout = bytes.get_vi()?;
        Ok(VersionParameter::DeliveryTimeout { object_timeout })
      }
      VersionSpecificParameterType::AuthorizationToken => {
        let len = bytes.get_vi()?;
        let length: usize =
          len
            .try_into()
            .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
              context: "VersionParameter::AuthorizationToken length",
              from_type: "u64",
              to_type: "usize",
              details: e.to_string(),
            })?;
        if bytes.remaining() < length {
          return Err(ParseError::NotEnoughBytes {
            context: "VersionParameter::AuthorizationToken length",
            needed: length,
            available: bytes.remaining(),
          });
        }
        let mut payload_bytes = bytes.copy_to_bytes(length);
        let alias_type = payload_bytes.get_vi()?;
        let alias_type = TokenAliasType::try_from(alias_type)?;
        match alias_type {
          TokenAliasType::Delete => {
            let token_alias = payload_bytes.get_vi()?;
            Ok(Self::new_auth_token_delete(token_alias))
          }
          TokenAliasType::Register => {
            let token_alias = payload_bytes.get_vi()?;
            let token_type = payload_bytes.get_vi()?;
            let token_value = payload_bytes;
            Ok(Self::new_auth_token_register(
              token_alias,
              token_type,
              token_value,
            ))
          }
          TokenAliasType::UseAlias => {
            let token_alias = payload_bytes.get_vi()?;
            Ok(Self::new_auth_token_use_alias(token_alias))
          }
          TokenAliasType::UseValue => {
            let token_type = payload_bytes.get_vi()?;
            let token_value = payload_bytes;
            Ok(Self::new_auth_token_use_value(token_type, token_value))
          }
        }
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::VersionParameter;
  use crate::model::common::varint::BufMutVarIntExt;
  use crate::model::parameter::constant::VersionSpecificParameterType;
  use bytes::{Buf, Bytes, BytesMut};

  #[test]
  fn test_roundtrip_max_cache_duration() {
    let orig = VersionParameter::new_max_cache_duration(0x1234);
    let mut buf = orig.serialize().unwrap();
    let got = VersionParameter::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_roundtrip_delivery_timeout() {
    let orig = VersionParameter::new_delivery_timeout(0xABCD);
    let mut buf = orig.serialize().unwrap();
    let got = VersionParameter::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_roundtrip_auth_token_delete() {
    let orig = VersionParameter::new_auth_token_delete(42);
    let mut buf = orig.serialize().unwrap();
    let got = VersionParameter::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_roundtrip_auth_token_register() {
    let orig = VersionParameter::new_auth_token_register(5, 1, Bytes::from_static(b"bytes"));
    let mut buf = orig.serialize().unwrap();
    let got = VersionParameter::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_roundtrip_auth_token_use_alias() {
    let orig = VersionParameter::new_auth_token_use_alias(100);
    let mut buf = orig.serialize().unwrap();
    let got = VersionParameter::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_roundtrip_auth_token_use_value() {
    let orig = VersionParameter::new_auth_token_use_value(16, Bytes::from_static(b"bytes"));
    let mut buf = orig.serialize().unwrap();
    let got = VersionParameter::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_deserialize_invalid_param_type() {
    let mut buf = BytesMut::new();
    buf.put_vi(0xFF_FF).unwrap(); // invalid type
    buf.put_vi(0xDEAD).unwrap();
    let err = VersionParameter::deserialize(&mut buf.freeze());
    assert!(err.is_err());
  }

  #[test]
  fn test_deserialize_missing_value_for_cache_duration() {
    let mut buf = BytesMut::new();
    buf
      .put_vi(VersionSpecificParameterType::MaxCacheDuration as u64)
      .unwrap();
    let err = VersionParameter::deserialize(&mut buf.freeze());
    assert!(err.is_err());
  }

  #[test]
  fn test_deserialize_missing_value_for_delivery_timeout() {
    let mut buf = BytesMut::new();
    buf
      .put_vi(VersionSpecificParameterType::DeliveryTimeout as u64)
      .unwrap();
    let err = VersionParameter::deserialize(&mut buf.freeze());
    assert!(err.is_err());
  }

  #[test]
  fn test_excess_bytes_after_max_cache_duration() {
    let orig = VersionParameter::new_max_cache_duration(0x55);
    let mut buf = BytesMut::from(&orig.serialize().unwrap()[..]);
    buf.extend_from_slice(b"XYZ");
    let mut bytes = buf.freeze();
    let got = VersionParameter::deserialize(&mut bytes).unwrap();
    assert_eq!(got, orig);
    assert_eq!(bytes.remaining(), 3);
    assert_eq!(&bytes[..], b"XYZ");
  }

  #[test]
  fn test_excess_bytes_after_delivery_timeout() {
    let orig = VersionParameter::new_delivery_timeout(0x66);
    let mut buf = BytesMut::from(&orig.serialize().unwrap()[..]);
    buf.extend_from_slice(&[1, 2, 3]);
    let mut bytes = buf.freeze();
    let got = VersionParameter::deserialize(&mut bytes).unwrap();
    assert_eq!(got, orig);
    assert_eq!(bytes.remaining(), 3);
    assert_eq!(&bytes[..], &[1, 2, 3]);
  }

  #[test]
  fn test_excess_bytes_after_auth_token_delete() {
    let orig = VersionParameter::new_auth_token_delete(9);
    let mut buf = BytesMut::from(&orig.serialize().unwrap()[..]);
    buf.extend_from_slice(b"EXTRA");
    let mut bytes = buf.freeze();
    let got = VersionParameter::deserialize(&mut bytes).unwrap();
    assert_eq!(got, orig);
    assert_eq!(bytes.remaining(), 5);
    assert_eq!(&bytes[..], b"EXTRA");
  }

  #[test]
  fn test_excess_bytes_after_auth_token_register() {
    let orig = VersionParameter::new_auth_token_register(1, 2, b"x".to_vec().into());
    let mut buf = BytesMut::from(&orig.serialize().unwrap()[..]);
    buf.extend_from_slice(b"++");
    let mut bytes = buf.freeze();
    let got = VersionParameter::deserialize(&mut bytes).unwrap();
    assert_eq!(got, orig);
    assert_eq!(bytes.remaining(), 2);
    assert_eq!(&bytes[..], b"++");
  }

  #[test]
  fn test_excess_bytes_after_auth_token_use_alias() {
    let orig = VersionParameter::new_auth_token_use_alias(3);
    let mut buf = BytesMut::from(&orig.serialize().unwrap()[..]);
    buf.extend_from_slice(&[9]);
    let mut bytes = buf.freeze();
    let got = VersionParameter::deserialize(&mut bytes).unwrap();
    assert_eq!(got, orig);
    assert_eq!(bytes.remaining(), 1);
    assert_eq!(&bytes[..], &[9]);
  }

  #[test]
  fn test_excess_bytes_after_auth_token_use_value() {
    let orig = VersionParameter::new_auth_token_use_value(7, b"v".to_vec().into());
    let mut buf = BytesMut::from(&orig.serialize().unwrap()[..]);
    buf.extend_from_slice(&[0xAB, 0xCD]);
    let mut bytes = buf.freeze();
    let got = VersionParameter::deserialize(&mut bytes).unwrap();
    assert_eq!(got, orig);
    assert_eq!(bytes.remaining(), 2);
    assert_eq!(&bytes[..], &[0xAB, 0xCD]);
  }
}
