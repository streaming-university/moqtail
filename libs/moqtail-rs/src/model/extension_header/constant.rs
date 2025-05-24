use std::convert::TryFrom;

use crate::model::error::ParseError;

#[repr(u64)]
#[derive(Clone, Debug, Copy, PartialEq)]
pub enum LOCHeaderExtensionId {
  CaptureTimestamp = 2,  // Section 2.3.1.1 - Common Header
  VideoFrameMarking = 4, // Section 2.3.2.2 - Video Header
  AudioLevel = 6,        // Section 2.3.3.1 - Audio Header
  VideoConfig = 13,      // Section 2.3.2.1 - Video Header
}

impl TryFrom<u64> for LOCHeaderExtensionId {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      2 => Ok(LOCHeaderExtensionId::CaptureTimestamp),
      4 => Ok(LOCHeaderExtensionId::VideoFrameMarking),
      6 => Ok(LOCHeaderExtensionId::AudioLevel),
      13 => Ok(LOCHeaderExtensionId::VideoConfig),
      _ => Err(ParseError::InvalidType {
        context: "LOCHeaderExtensionId::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<LOCHeaderExtensionId> for u64 {
  fn from(value: LOCHeaderExtensionId) -> Self {
    value as u64
  }
}
