use crate::model::error::ParseError;
use std::convert::TryFrom;

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum FetchHeaderType {
  Type0x05 = 0x05,
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum SubgroupHeaderType {
  /// No Subgroup ID field (Subgroup ID = 0), No Extensions
  Type0x08 = 0x08,
  /// No Subgroup ID field (Subgroup ID = 0), Extensions Present
  Type0x09 = 0x09,
  /// No Subgroup ID field (Subgroup ID = First Object ID), No Extensions
  Type0x0A = 0x0A,
  /// No Subgroup ID field (Subgroup ID = First Object ID), Extensions Present
  Type0x0B = 0x0B,
  /// Explicit Subgroup ID field, No Extensions
  Type0x0C = 0x0C,
  /// Explicit Subgroup ID field, Extensions Present
  Type0x0D = 0x0D,
}

impl SubgroupHeaderType {
  pub fn has_explicit_subgroup_id(&self) -> bool {
    matches!(self, Self::Type0x0C | Self::Type0x0D)
  }

  pub fn has_extensions(&self) -> bool {
    matches!(self, Self::Type0x09 | Self::Type0x0B | Self::Type0x0D)
  }
}

impl TryFrom<u64> for SubgroupHeaderType {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x08 => Ok(SubgroupHeaderType::Type0x08),
      0x09 => Ok(SubgroupHeaderType::Type0x09),
      0x0A => Ok(SubgroupHeaderType::Type0x0A),
      0x0B => Ok(SubgroupHeaderType::Type0x0B),
      0x0C => Ok(SubgroupHeaderType::Type0x0C),
      0x0D => Ok(SubgroupHeaderType::Type0x0D),
      _ => Err(ParseError::InvalidType {
        context: "SubgroupHeaderType::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<SubgroupHeaderType> for u64 {
  fn from(header_type: SubgroupHeaderType) -> Self {
    header_type as u64
  }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ObjectForwardingPreference {
  Subgroup,
  Datagram,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u64)]
pub enum ObjectStatus {
  /// 0x0: Normal object. Implicit for any non-zero length object. Zero-length objects explicitly encode this status.
  Normal = 0x0,
  /// 0x1: Indicates Object does not exist. This object does not exist at any publisher and will not be published in the future. SHOULD be cached.
  DoesNotExist = 0x1,
  /// 0x3: Indicates end of Group. ObjectId is one greater than the largest object produced in the group identified by the GroupID.
  /// Sent right after the last object in the group. If ObjectID is 0, there are no Objects in this Group. SHOULD be cached.
  EndOfGroup = 0x3,
  /// 0x4: Indicates end of Track. GroupID is either the largest group produced in this track and the ObjectID is one greater than the largest object produced in that group,
  /// or GroupID is one greater than the largest group produced in this track and the ObjectID is zero. SHOULD be cached.
  EndOfTrack = 0x4,
}

impl TryFrom<u64> for ObjectStatus {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x0 => Ok(ObjectStatus::Normal),
      0x1 => Ok(ObjectStatus::DoesNotExist),
      0x3 => Ok(ObjectStatus::EndOfGroup),
      0x4 => Ok(ObjectStatus::EndOfTrack),
      _ => Err(ParseError::InvalidType {
        context: "ObjectStatus::try_from(u8)",
        details: format!("Invalid status, got {value}"),
      }),
    }
  }
}

impl From<ObjectStatus> for u64 {
  fn from(status: ObjectStatus) -> Self {
    status as u64
  }
}
