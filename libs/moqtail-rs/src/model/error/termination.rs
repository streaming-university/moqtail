#[derive(Debug, PartialEq, Eq, Copy, Clone)]
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
  AuthTokenNotFound = 0x13,
  DuplicateAuthTokenAlias = 0x14,
  VersionNegotiationFailed = 0x15,
}

impl TerminationCode {
  pub fn to_json(&self) -> String {
    format!("{{\"error\":\"{:?}\",\"code\":{}}}", self, *self as u8)
  }

  pub fn to_u32(&self) -> u32 {
    *self as u32
  }
}
