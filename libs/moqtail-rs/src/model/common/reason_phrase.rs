use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::error::ParseError;
use bytes::{Buf, Bytes, BytesMut};

pub const MAX_REASON_PHRASE_LEN: usize = 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReasonPhrase {
  phrase: String,
}

impl ReasonPhrase {
  pub fn try_new(phrase: String) -> Result<Self, ParseError> {
    let len = phrase.len();
    if len > MAX_REASON_PHRASE_LEN {
      Err(ParseError::LengthExceedsMax {
        context: "ReasonPhrase::try_new",
        max: MAX_REASON_PHRASE_LEN,
        len,
      })
    } else {
      Ok(ReasonPhrase { phrase })
    }
  }

  pub fn serialize(&self) -> Result<Bytes, ParseError> {
    let data = self.phrase.as_bytes();
    let mut buf = BytesMut::new();
    buf.put_vi(data.len() as u64)?;
    buf.extend_from_slice(data);
    Ok(buf.freeze())
  }

  /// Decode from:  varint(length) || utf8‑bytes
  pub fn deserialize(bytes: &mut Bytes) -> Result<Self, ParseError> {
    let len_u64 = bytes.get_vi()?;
    let len: usize =
      len_u64
        .try_into()
        .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
          context: "ReasonPhrase::deserialize length",
          from_type: "u64",
          to_type: "usize",
          details: e.to_string(),
        })?;

    if len > MAX_REASON_PHRASE_LEN {
      return Err(ParseError::LengthExceedsMax {
        context: "reason phrase try_new",
        max: MAX_REASON_PHRASE_LEN,
        len,
      });
    }
    if bytes.remaining() < len {
      return Err(ParseError::NotEnoughBytes {
        context: "ReasonPhrase::value",
        needed: len,
        available: bytes.remaining(),
      });
    }
    let raw = bytes.copy_to_bytes(len);
    let phrase = String::from_utf8(raw.to_vec()).map_err(|e| ParseError::InvalidUTF8 {
      context: "ReasonPhrase::deserialize",
      details: e.to_string(),
    })?;
    Ok(ReasonPhrase { phrase })
  }
}

#[cfg(test)]
mod tests {
  use super::{MAX_REASON_PHRASE_LEN, ReasonPhrase};
  use crate::model::common::varint::BufMutVarIntExt;
  use bytes::{Buf, BytesMut};

  #[test]
  fn test_roundtrip() {
    let orig = ReasonPhrase::try_new("hello world".to_string()).unwrap();
    let mut buf = orig.serialize().unwrap();
    let got = ReasonPhrase::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_empty_phrase() {
    let orig = ReasonPhrase::try_new(String::new()).unwrap();
    let mut buf = orig.serialize().unwrap();
    let got = ReasonPhrase::deserialize(&mut buf).unwrap();
    assert_eq!(orig, got);
    assert_eq!(buf.remaining(), 0);
  }

  #[test]
  fn test_serialize_too_long() {
    let long = "a".repeat(MAX_REASON_PHRASE_LEN + 1);
    let err = ReasonPhrase::try_new(long);
    assert!(err.is_err())
  }

  #[test]
  fn test_deserialize_length_exceeds_max() {
    let mut buf = BytesMut::new();
    buf.put_vi((MAX_REASON_PHRASE_LEN + 1) as u64).unwrap();
    let mut bytes = buf.freeze();
    let err = ReasonPhrase::deserialize(&mut bytes);
    assert!(err.is_err())
  }

  #[test]
  fn test_deserialize_insufficient_bytes() {
    let mut buf = BytesMut::new();
    buf.put_vi(3).unwrap();
    buf.extend_from_slice(b"ab");
    let mut bytes = buf.freeze();
    let err = ReasonPhrase::deserialize(&mut bytes);
    assert!(err.is_err())
  }

  #[test]
  fn test_deserialize_invalid_utf8() {
    // length=2, but bytes are invalid UTF-8
    let mut buf = BytesMut::new();
    buf.put_vi(2).unwrap();
    buf.extend_from_slice(&[0xff, 0xff]);
    let mut bytes = buf.freeze();
    let err = ReasonPhrase::deserialize(&mut bytes);
    assert!(err.is_err())
  }
}
