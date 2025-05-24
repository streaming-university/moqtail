use super::constant::ControlMessageType;
use super::control_message::ControlMessageTrait;
use crate::model::common::pair::KeyValuePair;
use crate::model::common::tuple::Tuple;
use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::error::ParseError;
use bytes::{Buf, BufMut, Bytes, BytesMut};

#[derive(Debug, PartialEq, Clone)]
pub struct TrackStatusRequest {
  pub request_id: u64,
  pub track_namespace: Tuple,
  pub track_name: String,
  pub parameters: Vec<KeyValuePair>,
}

impl TrackStatusRequest {
  pub fn new(
    request_id: u64,
    track_namespace: Tuple,
    track_name: String,
    parameters: Vec<KeyValuePair>,
  ) -> Self {
    Self {
      request_id,
      track_namespace,
      track_name,
      parameters,
    }
  }
}

impl ControlMessageTrait for TrackStatusRequest {
  fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();
    buf.put_vi(ControlMessageType::TrackStatusRequest)?;

    let mut payload = BytesMut::new();
    payload.put_vi(self.request_id)?;
    payload.extend_from_slice(&self.track_namespace.serialize()?);
    payload.put_vi(self.track_name.len())?;
    payload.extend_from_slice(self.track_name.as_bytes());
    payload.put_vi(self.parameters.len())?;
    for param in &self.parameters {
      payload.extend_from_slice(&param.serialize()?);
    }

    let payload_len: u16 = payload
      .len()
      .try_into()
      .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
        context: "TrackStatusRequest::serialize(payload_length)",
        from_type: "usize",
        to_type: "u16",
        details: e.to_string(),
      })?;

    buf.put_u16(payload_len);
    buf.extend_from_slice(&payload);

    Ok(buf.freeze())
  }

  fn parse_payload(payload: &mut Bytes) -> Result<Box<Self>, ParseError> {
    let request_id = payload.get_vi()?;
    let track_namespace = Tuple::deserialize(payload)?;
    let name_length = payload.get_vi()?;
    let name_length: usize = name_length
      .try_into()
      .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
        context: "TrackStatusRequest::parse_payload(name_length)",
        from_type: "u64",
        to_type: "usize",
        details: e.to_string(),
      })?;

    if payload.remaining() < name_length {
      return Err(ParseError::NotEnoughBytes {
        context: "TrackStatusRequest::parse_payload(name_length)",
        needed: name_length,
        available: payload.remaining(),
      });
    }
    let name_bytes = payload.copy_to_bytes(name_length);

    let track_name =
      String::from_utf8(name_bytes.to_vec()).map_err(|e| ParseError::InvalidUTF8 {
        context: "TrackStatusRequest::parse_payload(track_name)",
        details: e.to_string(),
      })?;

    let param_count_u64 = payload.get_vi()?;
    let param_count: usize =
      param_count_u64
        .try_into()
        .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
          context: "Subscribe::deserialize(param_count)",
          from_type: "u64",
          to_type: "usize",
          details: e.to_string(),
        })?;

    let mut parameters = Vec::with_capacity(param_count);
    for _ in 0..param_count {
      let param = KeyValuePair::deserialize(payload)?;
      parameters.push(param);
    }

    Ok(Box::new(TrackStatusRequest {
      request_id,
      track_namespace,
      track_name,
      parameters,
    }))
  }

  fn get_type(&self) -> ControlMessageType {
    ControlMessageType::TrackStatusRequest
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let request_id = 241421;
    let track_namespace = Tuple::from_utf8_path("charlie/chocolate/factory");
    let track_name = "OompaLumpa".to_string();
    let parameters = vec![
      KeyValuePair::try_new_varint(0, 10).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"Chocomocco?!")).unwrap(),
    ];
    let track_status_request = TrackStatusRequest {
      request_id,
      track_namespace,
      track_name,
      parameters,
    };

    let mut buf = track_status_request.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::TrackStatusRequest as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());
    let deserialized = TrackStatusRequest::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, track_status_request);
    assert!(!buf.has_remaining());
  }

  #[test]
  fn test_excess_roundtrip() {
    let request_id = 241421;
    let track_namespace = Tuple::from_utf8_path("charlie/chocolate/factory");
    let track_name = "OompaLumpa".to_string();
    let parameters = vec![
      KeyValuePair::try_new_varint(0, 10).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"Chocomocco?!")).unwrap(),
    ];
    let track_status_request = TrackStatusRequest {
      request_id,
      track_namespace,
      track_name,
      parameters,
    };

    let serialized = track_status_request.serialize().unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();

    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::TrackStatusRequest as u64);
    let msg_length = buf.get_u16();

    assert_eq!(msg_length as usize, buf.remaining() - 3);
    let deserialized = TrackStatusRequest::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, track_status_request);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let request_id = 241421;
    let track_namespace = Tuple::from_utf8_path("charlie/chocolate/factory");
    let track_name = "OompaLumpa".to_string();
    let parameters = vec![
      KeyValuePair::try_new_varint(0, 10).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"Chocomocco?!")).unwrap(),
    ];
    let track_status_request = TrackStatusRequest {
      request_id,
      track_namespace,
      track_name,
      parameters,
    };

    let mut buf = track_status_request.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::TrackStatusRequest as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());

    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = TrackStatusRequest::parse_payload(&mut partial);
    assert!(deserialized.is_err());
  }
}
