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

use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::error::ParseError;
use bytes::{Buf, BufMut, Bytes, BytesMut};

use super::constant::SubgroupHeaderType;

#[derive(Debug, PartialEq, Clone, Copy)]
pub struct SubgroupHeader {
  pub header_type: SubgroupHeaderType,
  pub track_alias: u64,
  pub group_id: u64,
  pub subgroup_id: Option<u64>,
  pub publisher_priority: u8,
}

impl SubgroupHeader {
  /// Create a new subgroup header with fixed Subgroup ID = 0
  pub fn new_fixed_zero_id(
    track_alias: u64,
    group_id: u64,
    publisher_priority: u8,
    has_extensions: bool,
  ) -> Self {
    let header_type = if has_extensions {
      SubgroupHeaderType::Type0x09
    } else {
      SubgroupHeaderType::Type0x08
    };

    Self {
      header_type,
      track_alias,
      group_id,
      subgroup_id: Some(0),
      publisher_priority,
    }
  }

  /// Create a new subgroup header where Subgroup ID = First Object ID
  pub fn new_first_object_id(
    track_alias: u64,
    group_id: u64,
    publisher_priority: u8,
    has_extensions: bool,
  ) -> Self {
    let header_type = if has_extensions {
      SubgroupHeaderType::Type0x0B
    } else {
      SubgroupHeaderType::Type0x0A
    };

    Self {
      header_type,
      track_alias,
      group_id,
      subgroup_id: None, // Will be set to first object ID
      publisher_priority,
    }
  }

  /// Create a new subgroup header with explicit Subgroup ID
  pub fn new_with_explicit_id(
    track_alias: u64,
    group_id: u64,
    subgroup_id: u64,
    publisher_priority: u8,
    has_extensions: bool,
  ) -> Self {
    let header_type = if has_extensions {
      SubgroupHeaderType::Type0x0D
    } else {
      SubgroupHeaderType::Type0x0C
    };

    Self {
      header_type,
      track_alias,
      group_id,
      subgroup_id: Some(subgroup_id),
      publisher_priority,
    }
  }

  pub fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();

    // Type field
    buf.put_vi(self.header_type as u64)?;

    // Track Alias
    buf.put_vi(self.track_alias)?;

    // Group ID
    buf.put_vi(self.group_id)?;

    // Subgroup ID (if present)
    if self.header_type.has_explicit_subgroup_id() {
      if let Some(id) = self.subgroup_id {
        buf.put_vi(id)?;
      } else {
        return Err(ParseError::ProtocolViolation {
          context: "SubgroupHeader::serialize(header_type)",
          details: "Subgroup_id field is required for this header type".to_string(),
        });
      }
    }

    // Publisher Priority
    buf.put_u8(self.publisher_priority);

    Ok(buf.freeze())
  }

  pub fn deserialize(bytes: &mut Bytes) -> Result<Self, ParseError> {
    // Parse type
    let type_value = bytes.get_vi()?;

    let header_type = SubgroupHeaderType::try_from(type_value)?;

    // Parse track alias
    let track_alias = bytes.get_vi()?;

    // Parse group ID
    let group_id = bytes.get_vi()?;

    // Parse subgroup ID if present
    let subgroup_id = if header_type.has_explicit_subgroup_id() {
      Some(bytes.get_vi()?)
    } else if matches!(
      header_type,
      SubgroupHeaderType::Type0x08 | SubgroupHeaderType::Type0x09
    ) {
      Some(0) // Fixed at 0 for types 0x08 and 0x09
    } else {
      None // For types 0x0A and 0x0B, subgroup ID = first object ID
    };

    if bytes.remaining() < 1 {
      return Err(ParseError::NotEnoughBytes {
        context: "SubgroupHeader::deserialize(publisher_priority)",
        needed: 1,
        available: bytes.remaining(),
      });
    }
    let publisher_priority = bytes.get_u8();

    Ok(Self {
      header_type,
      track_alias,
      group_id,
      subgroup_id,
      publisher_priority,
    })
  }
}

#[cfg(test)]
mod tests {

  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let header_type = SubgroupHeaderType::Type0x0C;
    let track_alias = 87;
    let group_id = 9;
    let subgroup_id = Some(11);
    let publisher_priority = 255;
    let subgroup_header = SubgroupHeader {
      header_type,
      track_alias,
      group_id,
      subgroup_id,
      publisher_priority,
    };

    let mut buf = subgroup_header.serialize().unwrap();
    let deserialized = SubgroupHeader::deserialize(&mut buf).unwrap();
    assert_eq!(deserialized, subgroup_header);
    assert!(!buf.has_remaining());
  }

  #[test]
  fn test_excess_roundtrip() {
    let header_type = SubgroupHeaderType::Type0x0C;
    let track_alias = 87;
    let group_id = 9;
    let subgroup_id = Some(11);
    let publisher_priority = 255;
    let subgroup_header = SubgroupHeader {
      header_type,
      track_alias,
      group_id,
      subgroup_id,
      publisher_priority,
    };

    let serialized = subgroup_header.serialize().unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();

    let deserialized = SubgroupHeader::deserialize(&mut buf).unwrap();
    assert_eq!(deserialized, subgroup_header);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let header_type = SubgroupHeaderType::Type0x0C;
    let track_alias = 87;
    let group_id = 9;
    let subgroup_id = Some(11);
    let publisher_priority = 255;
    let subgroup_header = SubgroupHeader {
      header_type,
      track_alias,
      group_id,
      subgroup_id,
      publisher_priority,
    };
    let buf = subgroup_header.serialize().unwrap();
    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = SubgroupHeader::deserialize(&mut partial);
    assert!(deserialized.is_err());
  }
}
