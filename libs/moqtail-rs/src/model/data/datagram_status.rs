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

use bytes::{Buf, BufMut, Bytes, BytesMut};

use crate::model::common::pair::KeyValuePair;
use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::error::ParseError;

use super::constant::ObjectStatus;

#[derive(Debug, Clone, PartialEq)]
pub struct DatagramStatus {
  pub track_alias: u64,
  pub group_id: u64,
  pub object_id: u64,
  pub publisher_priority: u8,
  pub extension_headers: Option<Vec<KeyValuePair>>,
  pub object_status: ObjectStatus,
}

impl DatagramStatus {
  pub fn new(
    track_alias: u64,
    group_id: u64,
    object_id: u64,
    publisher_priority: u8,
    object_status: ObjectStatus,
  ) -> Self {
    DatagramStatus {
      track_alias,
      group_id,
      object_id,
      publisher_priority,
      extension_headers: None,
      object_status,
    }
  }

  pub fn with_extensions(
    track_alias: u64,
    group_id: u64,
    object_id: u64,
    publisher_priority: u8,
    extension_headers: Vec<KeyValuePair>,
    object_status: ObjectStatus,
  ) -> Self {
    DatagramStatus {
      track_alias,
      group_id,
      object_id,
      publisher_priority,
      extension_headers: Some(extension_headers),
      object_status,
    }
  }
  pub fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();

    // Type: 0x02 if no extensions, 0x03 if extensions present
    buf.put_vi(if self.extension_headers.is_some() {
      0x03
    } else {
      0x02
    })?;

    buf.put_vi(self.track_alias)?;
    buf.put_vi(self.group_id)?;
    buf.put_vi(self.object_id)?;
    buf.put_u8(self.publisher_priority);

    let mut payload = BytesMut::new();

    if let Some(ext_headers) = &self.extension_headers {
      for header in ext_headers {
        payload.extend_from_slice(&header.serialize()?);
      }
    }

    buf.put_vi(payload.len())?;
    buf.extend_from_slice(&payload);
    buf.put_vi(self.object_status)?;
    Ok(buf.freeze())
  }

  pub fn deserialize(bytes: &mut Bytes) -> Result<Self, ParseError> {
    let msg_type = bytes.get_vi()?;

    if msg_type != 0x02 && msg_type != 0x03 {
      return Err(ParseError::InvalidType {
        context: "ObjectDatagramStatus::deserialize(msg_type)",
        details: format!("Accepted types: 0x02, 0x03; got {msg_type}"),
      });
    }
    let track_alias = bytes.get_vi()?;
    let group_id = bytes.get_vi()?;
    let object_id = bytes.get_vi()?;

    if bytes.remaining() < 1 {
      return Err(ParseError::NotEnoughBytes {
        context: "ObjectDatagramStatus::deserialize",
        needed: 1,
        available: 0,
      });
    }

    let publisher_priority = bytes.get_u8();

    let extension_headers = if msg_type == 0x03 {
      let ext_len = bytes.get_vi()?;

      if ext_len == 0 {
        return Err(ParseError::ProtocolViolation {
          context: "ObjectDatagramStatus::deserialize(ext_len)",
          details: "Extension headers present (Type=0x03) but length is 0".to_string(),
        });
      }
      let ext_len: usize =
        ext_len
          .try_into()
          .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
            context: "ObjectDatagramStatus::deserialize",
            from_type: "u64",
            to_type: "usize",
            details: e.to_string(),
          })?;

      if bytes.remaining() < ext_len {
        return Err(ParseError::NotEnoughBytes {
          context: "ObjectDatagramStatus::deserialize",
          needed: ext_len,
          available: bytes.remaining(),
        });
      }
      let mut header_bytes = bytes.copy_to_bytes(ext_len);
      let mut headers: Vec<KeyValuePair> = Vec::new();
      while header_bytes.has_remaining() {
        let h = KeyValuePair::deserialize(&mut header_bytes).map_err(|_| {
          ParseError::ProtocolViolation {
            context: "ObjectDatagramStatus::deserialize(headers)",
            details: "Should be able to parse headers".to_string(),
          }
        })?;
        headers.push(h);
      }
      Some(headers)
    } else {
      None
    };

    let object_status_raw = bytes.get_vi()?;
    let object_status = ObjectStatus::try_from(object_status_raw)?;

    Ok(DatagramStatus {
      track_alias,
      group_id,
      object_id,
      publisher_priority,
      extension_headers,
      object_status,
    })
  }
}
#[cfg(test)]
mod tests {

  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let track_alias = 144;
    let group_id: u64 = 9;
    let object_id: u64 = 10;
    let publisher_priority: u8 = 255;
    let extension_headers = Some(vec![
      KeyValuePair::try_new_varint(0, 10).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"wololoo")).unwrap(),
    ]);
    let object_status = ObjectStatus::Normal;

    let datagram_object = DatagramStatus {
      track_alias,
      group_id,
      object_id,
      publisher_priority,
      extension_headers,
      object_status,
    };

    let mut buf = datagram_object.serialize().unwrap();
    let deserialized = DatagramStatus::deserialize(&mut buf).unwrap();
    assert_eq!(deserialized, datagram_object);
    assert!(!buf.has_remaining());
  }
}
