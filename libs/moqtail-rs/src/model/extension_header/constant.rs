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
