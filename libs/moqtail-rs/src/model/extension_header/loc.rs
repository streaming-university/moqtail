use crate::model::common::pair::KeyValuePair;
use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::error::ParseError;
use bytes::{Buf, Bytes, BytesMut};

use super::constant::LOCHeaderExtensionId;

#[derive(Clone, Debug, PartialEq)]
pub enum LOCHeaderExtension {
  CaptureTimestamp { value: u64 },
  VideoFrameMarking { value: u64 },
  AudioLevel { value: u64 },
  VideoConfig { value: Bytes },
}

impl LOCHeaderExtension {
  pub fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();
    match self {
      LOCHeaderExtension::CaptureTimestamp { value } => {
        buf.put_vi(LOCHeaderExtensionId::CaptureTimestamp)?;
        buf.put_vi(*value)?;
      }
      LOCHeaderExtension::VideoFrameMarking { value } => {
        buf.put_vi(LOCHeaderExtensionId::VideoFrameMarking)?;
        buf.put_vi(*value)?;
      }
      LOCHeaderExtension::AudioLevel { value } => {
        buf.put_vi(LOCHeaderExtensionId::AudioLevel)?;
        buf.put_vi(*value)?;
      }
      LOCHeaderExtension::VideoConfig { value } => {
        buf.put_vi(LOCHeaderExtensionId::VideoConfig)?;
        buf.put_vi(value.len())?;
        buf.extend_from_slice(value);
      }
    }
    Ok(buf.freeze())
  }
  pub fn deserialize(payload: &mut Bytes) -> Result<Self, ParseError> {
    let id = payload.get_vi()?;
    let loc_header_extension_id = LOCHeaderExtensionId::try_from(id)?;

    match loc_header_extension_id {
      LOCHeaderExtensionId::VideoConfig => {
        let payload_length = payload.get_vi()?;
        let payload_length: usize =
          payload_length
            .try_into()
            .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
              context: "LOCHeaderExtension::deserialize(payload_length)",
              from_type: "u64",
              to_type: "usize",
              details: e.to_string(),
            })?;
        let value = payload.copy_to_bytes(payload_length);
        Ok(LOCHeaderExtension::VideoConfig { value })
      }
      LOCHeaderExtensionId::AudioLevel => {
        let value = payload.get_vi()?;
        Ok(LOCHeaderExtension::AudioLevel { value })
      }
      LOCHeaderExtensionId::CaptureTimestamp => {
        let value = payload.get_vi()?;
        Ok(LOCHeaderExtension::CaptureTimestamp { value })
      }
      LOCHeaderExtensionId::VideoFrameMarking => {
        let value = payload.get_vi()?;
        Ok(LOCHeaderExtension::VideoFrameMarking { value })
      }
    }
  }
}

impl TryFrom<KeyValuePair> for LOCHeaderExtension {
  type Error = ParseError;
  fn try_from(pair: KeyValuePair) -> Result<Self, Self::Error> {
    match pair {
      KeyValuePair::VarInt { type_value, value } => {
        let id = LOCHeaderExtensionId::try_from(type_value)?;
        match id {
          LOCHeaderExtensionId::AudioLevel => Ok(LOCHeaderExtension::AudioLevel { value }),
          LOCHeaderExtensionId::CaptureTimestamp => {
            Ok(LOCHeaderExtension::CaptureTimestamp { value })
          }
          LOCHeaderExtensionId::VideoFrameMarking => {
            Ok(LOCHeaderExtension::VideoFrameMarking { value })
          }
          _ => Err(ParseError::InvalidType {
            context: "LOCHeaderExtension::try_from(KeyValuePair::VarInt)",
            details: format!("Invalid type, got {type_value}"),
          }),
        }
      }
      KeyValuePair::Bytes { type_value, value } => {
        let id = LOCHeaderExtensionId::try_from(type_value)?;
        match id {
          LOCHeaderExtensionId::VideoConfig => Ok(LOCHeaderExtension::VideoConfig { value }),
          _ => Err(ParseError::InvalidType {
            context: "LOCHeaderExtension::try_from(KeyValuePair::Bytes)",
            details: format!("Invalid type, got {type_value}"),
          }),
        }
      }
    }
  }
}

#[cfg(test)]
mod tests {

  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let value = 144;
    let loc = LOCHeaderExtension::AudioLevel { value };

    let mut buf = loc.serialize().unwrap();
    let deserialized = LOCHeaderExtension::deserialize(&mut buf).unwrap();
    assert_eq!(deserialized, loc);
    assert!(!buf.has_remaining());
  }

  #[test]
  fn test_excess_roundtrip() {
    let value = 144;
    let loc = LOCHeaderExtension::AudioLevel { value };

    let serialized = loc.serialize().unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();

    let deserialized = LOCHeaderExtension::deserialize(&mut buf).unwrap();
    assert_eq!(deserialized, loc);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let value = 144;
    let loc = LOCHeaderExtension::AudioLevel { value };
    let buf = loc.serialize().unwrap();
    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = LOCHeaderExtension::deserialize(&mut partial);
    assert!(deserialized.is_err());
  }
}
