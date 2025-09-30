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

use super::constant::ControlMessageType;
use super::control_message::ControlMessageTrait;
use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::error::ParseError;
use bytes::{Buf, BufMut, Bytes, BytesMut};

#[derive(Debug, PartialEq, Clone)]
pub struct GoAway {
  pub new_session_uri: Option<String>,
}

impl GoAway {
  pub fn new(new_session_uri: Option<String>) -> Self {
    let new_session_uri = new_session_uri.filter(|uri| !uri.is_empty());
    Self { new_session_uri }
  }
}

impl ControlMessageTrait for GoAway {
  fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();
    buf.put_vi(ControlMessageType::GoAway)?;

    let mut payload = BytesMut::new();
    match &self.new_session_uri {
      Some(uri) => {
        payload.put_vi(uri.len())?;
        payload.extend_from_slice(uri.as_bytes());
      }
      None => {
        payload.put_vi(0)?;
      }
    }

    let payload_len: u16 = payload
      .len()
      .try_into()
      .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
        context: "GoAway::serialize(payload_length)",
        from_type: "usize",
        to_type: "u16",
        details: e.to_string(),
      })?;
    buf.put_u16(payload_len);
    buf.extend_from_slice(&payload);

    Ok(buf.freeze())
  }

  // TODO: If the URI is zero bytes long, the current URI is reused instead.
  // The new session URI SHOULD use the same scheme as the current URL to ensure compatibility.
  // The maximum length of the New Session URI is 8,192 bytes.
  // If an endpoint receives a length exceeding the maximum, it MUST close the session with a Protocol Violation.
  // If a server receives a GOAWAY with a non-zero New Session URI Length it MUST terminate the session with a Protocol Violation.

  fn parse_payload(payload: &mut Bytes) -> Result<Box<Self>, ParseError> {
    let uri_length = payload.get_vi()?;
    let uri_length: usize = uri_length
      .try_into()
      .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
        context: "GoAway::parse_payload(uri_length)",
        from_type: "u64",
        to_type: "usize",
        details: e.to_string(),
      })?;

    if uri_length == 0 {
      return Ok(Box::new(GoAway {
        new_session_uri: None,
      }));
    }

    if payload.remaining() < uri_length {
      return Err(ParseError::NotEnoughBytes {
        context: "GoAway::parse_payload(uri_length)",
        needed: uri_length,
        available: payload.remaining(),
      });
    }

    let new_session_uri = payload.copy_to_bytes(uri_length);
    let new_session_uri =
      String::from_utf8(new_session_uri.to_vec()).map_err(|e| ParseError::InvalidUTF8 {
        context: "GoAway::parse_payload(new_session_uri)",
        details: e.to_string(),
      })?;

    Ok(Box::new(GoAway {
      new_session_uri: Some(new_session_uri),
    }))
  }
  fn get_type(&self) -> ControlMessageType {
    ControlMessageType::GoAway
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let new_session_uri = Some("Begone wreched monster".to_string());
    let go_away = GoAway { new_session_uri };
    let mut buf = go_away.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::GoAway as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());
    let deserialized = GoAway::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, go_away);
    assert!(!buf.has_remaining());
  }

  #[test]
  fn test_excess_roundtrip() {
    let new_session_uri = Some("Begone wreched monster".to_string());
    let go_away = GoAway { new_session_uri };

    let serialized = go_away.serialize().unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();

    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::GoAway as u64);
    let msg_length = buf.get_u16();

    assert_eq!(msg_length as usize, buf.remaining() - 3);
    let deserialized = GoAway::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, go_away);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let new_session_uri = Some("Begone wreched monster".to_string());
    let go_away = GoAway { new_session_uri };
    let mut buf = go_away.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::GoAway as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());

    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = GoAway::parse_payload(&mut partial);
    assert!(deserialized.is_err());
  }
}
