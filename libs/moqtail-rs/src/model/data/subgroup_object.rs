// Copyright 2025 The MOQtail Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

use bytes::{Buf, Bytes, BytesMut};

use crate::model::common::pair::KeyValuePair;
use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::error::ParseError;

use super::constant::ObjectStatus;

#[derive(Debug, Clone, PartialEq)]
pub struct SubgroupObject {
  pub object_id: u64,
  pub extension_headers: Option<Vec<KeyValuePair>>,
  pub object_status: Option<ObjectStatus>,
  pub payload: Option<Bytes>,
}

impl SubgroupObject {
  pub fn serialize(&self, has_extensions: bool) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();

    buf.put_vi(self.object_id)?;

    if has_extensions {
      if let Some(ext_headers) = &self.extension_headers {
        let mut ext_buf = BytesMut::new();
        for header in ext_headers {
          ext_buf.extend_from_slice(&header.serialize()?);
        }
        buf.put_vi(ext_buf.len())?;
        buf.extend_from_slice(&ext_buf);
      } else {
        return Err(ParseError::ProtocolViolation {
          context: "SubgroupObject::serialize(ext)",
          details: "Has extensions but length 0".to_string(),
        });
      }
    }

    if let Some(status) = self.object_status {
      buf.put_vi(0u64)?;
      buf.put_vi(status)?;
    } else if let Some(payload) = &self.payload {
      buf.put_vi(payload.len())?;
      buf.extend_from_slice(payload);
    } else {
      return Err(ParseError::ProtocolViolation {
        context: "SubgroupObject::serialize",
        details: "No object status, no payload".to_string(),
      });
    }

    Ok(buf.freeze())
  }

  pub fn deserialize(bytes: &mut Bytes, has_extensions: bool) -> Result<Self, ParseError> {
    let object_id = bytes.get_vi()?;

    let extension_headers = if has_extensions {
      let ext_len = bytes.get_vi()?;

      if ext_len > 0 {
        let ext_len: usize =
          ext_len
            .try_into()
            .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
              context: "SubgroupObject::deserialize",
              from_type: "u64",
              to_type: "usize",
              details: e.to_string(),
            })?;

        if bytes.remaining() < ext_len {
          return Err(ParseError::NotEnoughBytes {
            context: "SubgroupObject::deserialize",
            needed: ext_len,
            available: bytes.remaining(),
          });
        }

        let mut header_bytes = bytes.copy_to_bytes(ext_len);
        let mut headers: Vec<KeyValuePair> = Vec::new();

        while header_bytes.has_remaining() {
          match KeyValuePair::deserialize(&mut header_bytes) {
            Ok(header) => headers.push(header),
            Err(_) => {
              return Err(ParseError::ProtocolViolation {
                context: "SubgroupObject::deserialize",
                details: "Failed to parse extension header".to_string(),
              });
            }
          }
        }

        Some(headers)
      } else {
        None
      }
    } else {
      None
    };

    let payload_len = bytes.get_vi()?;

    let (object_status, payload) = if payload_len == 0 {
      let status_raw = bytes.get_vi()?;
      let status = ObjectStatus::try_from(status_raw)?;
      (Some(status), None)
    } else {
      let payload_len: usize = payload_len
        .try_into()
        .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
          context: "SubgroupObject::deserialize",
          from_type: "u64",
          to_type: "usize",
          details: e.to_string(),
        })?;

      if bytes.remaining() < payload_len {
        return Err(ParseError::NotEnoughBytes {
          context: "SubgroupObject::deserialize",
          needed: payload_len,
          available: bytes.remaining(),
        });
      }
      let payload_data = bytes.copy_to_bytes(payload_len);
      (None, Some(payload_data))
    };

    Ok(SubgroupObject {
      object_id,
      extension_headers,
      object_status,
      payload,
    })
  }
}

#[cfg(test)]
mod tests {

  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let object_id: u64 = 10;
    let extension_headers = Some(vec![
      KeyValuePair::try_new_varint(0, 10).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"wololoo")).unwrap(),
    ]);
    let object_status = None;
    let payload = Some(Bytes::from_static(b"01239gjawkk92837aldmi"));

    let subgroup_object = SubgroupObject {
      object_id,
      extension_headers,
      payload,
      object_status,
    };

    let mut buf = subgroup_object.serialize(true).unwrap();
    let deserialized = SubgroupObject::deserialize(&mut buf, true).unwrap();
    assert_eq!(deserialized, subgroup_object);
    assert!(!buf.has_remaining());
  }

  #[test]
  fn test_excess_roundtrip() {
    let object_id: u64 = 10;
    let extension_headers = Some(vec![
      KeyValuePair::try_new_varint(0, 10).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"wololoo")).unwrap(),
    ]);
    let object_status = None;
    let payload = Some(Bytes::from_static(b"01239gjawkk92837aldmi"));

    let subgroup_object = SubgroupObject {
      object_id,
      extension_headers,
      payload,
      object_status,
    };

    let serialized = subgroup_object.serialize(true).unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();

    let deserialized = SubgroupObject::deserialize(&mut buf, true).unwrap();
    assert_eq!(deserialized, subgroup_object);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let object_id: u64 = 10;
    let extension_headers = Some(vec![
      KeyValuePair::try_new_varint(0, 10).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"wololoo")).unwrap(),
    ]);
    let object_status = None;
    let payload = Some(Bytes::from_static(b"01239gjawkk92837aldmi"));

    let subgroup_object = SubgroupObject {
      object_id,
      extension_headers,
      payload,
      object_status,
    };

    let buf = subgroup_object.serialize(true).unwrap();
    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = SubgroupObject::deserialize(&mut partial, true);
    assert!(deserialized.is_err());
  }
}
