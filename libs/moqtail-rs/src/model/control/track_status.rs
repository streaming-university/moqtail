use super::constant::{ControlMessageType, TrackStatusCode};
use super::control_message::ControlMessageTrait;
use crate::model::common::location::Location;
use crate::model::common::pair::KeyValuePair;
use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::error::ParseError;
use bytes::{BufMut, Bytes, BytesMut};

#[derive(Debug, PartialEq, Clone)]
// TODO: TRACKS STATUS FORMAT IS POORLY DESIGNED
pub struct TrackStatus {
  pub request_id: u64,
  pub status_code: TrackStatusCode,
  pub largest_location: Location,
  pub parameters: Vec<KeyValuePair>,
}

impl TrackStatus {
  pub fn new(
    request_id: u64,
    status_code: TrackStatusCode,
    largest_location: Location,
    parameters: Vec<KeyValuePair>,
  ) -> Self {
    TrackStatus {
      request_id,
      status_code,
      largest_location,
      parameters,
    }
  }
}

impl ControlMessageTrait for TrackStatus {
  fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();
    buf.put_vi(ControlMessageType::TrackStatus)?;

    let mut payload = BytesMut::new();
    payload.put_vi(self.request_id)?;
    payload.put_vi(self.status_code)?;
    match &self.status_code {
      TrackStatusCode::InProgress
      | TrackStatusCode::Finished
      | TrackStatusCode::RelayUnavailable => {
        payload.extend_from_slice(&self.largest_location.serialize()?);
      }
      TrackStatusCode::DoesNotExist | TrackStatusCode::NotYetBegun => {
        payload.extend_from_slice(
          &Location {
            group: 0,
            object: 0,
          }
          .serialize()?,
        );
      }
    }

    payload.put_vi(self.parameters.len())?;
    for param in &self.parameters {
      payload.extend_from_slice(&param.serialize()?);
    }

    let payload_len: u16 = payload
      .len()
      .try_into()
      .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
        context: "TrackStatus::serialize(payload_length)",
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
    let status_code_raw = payload.get_vi()?;
    let status_code = TrackStatusCode::try_from(status_code_raw)?;

    let largest_location = match status_code {
      TrackStatusCode::InProgress
      | TrackStatusCode::Finished
      | TrackStatusCode::RelayUnavailable => Location::deserialize(payload)?,
      TrackStatusCode::DoesNotExist | TrackStatusCode::NotYetBegun => Location {
        group: 0,
        object: 0,
      },
    };

    let param_count_u64 = payload.get_vi()?;
    let param_count: usize =
      param_count_u64
        .try_into()
        .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
          context: "TrackStatus::parse_payload(param_count)",
          from_type: "u64",
          to_type: "usize",
          details: e.to_string(),
        })?;

    let mut parameters = Vec::with_capacity(param_count);
    for _ in 0..param_count {
      let param = KeyValuePair::deserialize(payload)?;
      parameters.push(param);
    }

    Ok(Box::new(TrackStatus {
      request_id,
      status_code,
      largest_location,
      parameters,
    }))
  }

  fn get_type(&self) -> ControlMessageType {
    ControlMessageType::TrackStatus
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let request_id = 241421;
    let status_code = TrackStatusCode::Finished;
    let largest_location = Location {
      group: 1,
      object: 1,
    };
    let parameters = vec![
      KeyValuePair::try_new_varint(0, 10).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"Finito?!")).unwrap(),
    ];
    let track_status = TrackStatus {
      request_id,
      status_code,
      largest_location,
      parameters,
    };

    let mut buf = track_status.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::TrackStatus as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());
    let deserialized = TrackStatus::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, track_status);
    assert!(!buf.has_remaining());
  }

  #[test]
  fn test_excess_roundtrip() {
    let request_id = 241421;
    let status_code = TrackStatusCode::Finished;
    let largest_location = Location {
      group: 1,
      object: 1,
    };
    let parameters = vec![
      KeyValuePair::try_new_varint(0, 10).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"Finito?!")).unwrap(),
    ];
    let track_status = TrackStatus {
      request_id,
      status_code,
      largest_location,
      parameters,
    };

    let serialized = track_status.serialize().unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();

    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::TrackStatus as u64);
    let msg_length = buf.get_u16();

    assert_eq!(msg_length as usize, buf.remaining() - 3);
    let deserialized = TrackStatus::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, track_status);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let request_id = 241421;
    let status_code = TrackStatusCode::Finished;
    let largest_location = Location {
      group: 1,
      object: 1,
    };
    let parameters = vec![
      KeyValuePair::try_new_varint(0, 10).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"Finito?!")).unwrap(),
    ];
    let track_status = TrackStatus {
      request_id,
      status_code,
      largest_location,
      parameters,
    };

    let mut buf = track_status.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::TrackStatus as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());

    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = TrackStatus::parse_payload(&mut partial);
    assert!(deserialized.is_err());
  }
}
