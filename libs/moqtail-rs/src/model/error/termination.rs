use std::fmt::Display;
use thiserror::Error;

#[derive(Debug, PartialEq, Eq, Copy, Clone, Error)]
pub enum TerminationCode {
  NoError = 0x0,
  InternalError = 0x1,
  Unauthorized = 0x2,
  ProtocolViolation = 0x3,
  InvalidRequestID = 0x4,
  DuplicateTrackAlias = 0x5,
  KeyValueFormattingError = 0x6,
  TooManyRequests = 0x7,
  InvalidPath = 0x8,
  MalformedPath = 0x9,
  GoawayTimeout = 0x10,
  ControlMessageTimeout = 0x11,
  DataStreamTimeout = 0x12,
  AuthTokenCacheOverflow = 0x13,
  DuplicateAuthTokenAlias = 0x14,
  VersionNegotiationFailed = 0x15,
  MalformedAuthToken = 0x16,
  UnknownAuthTokenAlias = 0x17,
  ExpiredAuthToken = 0x18,
  InvalidAuthority = 0x19,
  MalformedAuthority = 0x1A,
}

impl TerminationCode {
  pub fn to_json(&self) -> String {
    format!("{{\"error\":\"{:?}\",\"code\":{}}}", self, *self as u8)
  }

  pub fn to_u32(&self) -> u32 {
    *self as u32
  }
}

impl Display for TerminationCode {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "{self:?}")
  }
}
