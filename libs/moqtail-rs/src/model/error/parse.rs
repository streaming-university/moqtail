use thiserror::Error;

#[derive(Debug, Error)]
pub enum ParseError {
  #[error("[{context}] not enough bytes: needed {needed}, available {available}")]
  NotEnoughBytes {
    context: &'static str,
    needed: usize,
    available: usize,
  },

  #[error("[{context}] cannot cast from {from_type} to {to_type}, [{details}]")]
  CastingError {
    context: &'static str,
    from_type: &'static str,
    to_type: &'static str,
    details: String,
  },

  #[error("[{context}] value {value} too large to encode as varint")]
  VarIntOverflow { context: &'static str, value: u64 },

  #[error("[{context}] length {len} exceeds maximum of {max}, protocol violation")]
  LengthExceedsMax {
    context: &'static str,
    max: usize,
    len: usize,
  },

  #[error("[{context}] key value formatting error")]
  KeyValueFormattingError { context: &'static str },

  #[error("Invalid type: [{context}], [{details}]")]
  InvalidType {
    context: &'static str,
    details: String,
  },

  #[error("Invalid UTF8: [{context}], [{details}]")]
  InvalidUTF8 {
    context: &'static str,
    details: String,
  },

  #[error("Protocol violation: [{context}], [{details}]")]
  ProcotolViolation {
    context: &'static str,
    details: String,
  },
  #[error("Track naming error: [{context}], [{details}]")]
  TrackNameError {
    context: &'static str,
    details: String,
  },
  #[error("Track naming error: [{context}], [{details}]")]
  TrackAliasError {
    context: &'static str,
    details: String,
  },
  #[error("Timeout: [{context}]")]
  Timeout { context: &'static str },
  #[error("[{context}], [{msg}]")]
  Other { context: &'static str, msg: String },
}
