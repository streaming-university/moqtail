use super::constant::{ControlMessageType, GroupOrder};
use super::control_message::ControlMessageTrait;
use crate::model::common::location::Location;
use crate::model::common::pair::KeyValuePair;
use crate::model::common::varint::{BufMutVarIntExt, BufVarIntExt};
use crate::model::error::ParseError;
use bytes::{Buf, BufMut, Bytes, BytesMut};

#[derive(Debug, PartialEq, Clone)]
pub struct FetchOk {
  pub request_id: u64,
  pub group_order: GroupOrder,
  pub end_of_track: bool,
  pub end_location: Location,
  pub subscribe_parameters: Vec<KeyValuePair>,
}

impl FetchOk {
  pub fn new_ascending(
    request_id: u64,
    end_of_track: bool,
    end_location: Location,
    subscribe_parameters: Vec<KeyValuePair>,
  ) -> Self {
    Self {
      request_id,
      group_order: GroupOrder::Ascending,
      end_of_track,
      end_location,
      subscribe_parameters,
    }
  }

  pub fn new_descending(
    request_id: u64,
    end_of_track: bool,
    end_location: Location,
    subscribe_parameters: Vec<KeyValuePair>,
  ) -> Self {
    Self {
      request_id,
      group_order: GroupOrder::Descending,
      end_of_track,
      end_location,
      subscribe_parameters,
    }
  }
}

impl ControlMessageTrait for FetchOk {
  fn serialize(&self) -> Result<Bytes, ParseError> {
    let mut buf = BytesMut::new();
    buf.put_vi(ControlMessageType::FetchOk)?;

    let mut payload = BytesMut::new();
    payload.put_vi(self.request_id)?;
    payload.put_u8(self.group_order as u8);
    payload.put_u8(if self.end_of_track { 1u8 } else { 0u8 });
    payload.extend_from_slice(&self.end_location.serialize()?);
    payload.put_vi(self.subscribe_parameters.len())?;
    for param in &self.subscribe_parameters {
      payload.extend_from_slice(&param.serialize()?);
    }

    let payload_len: u16 = payload
      .len()
      .try_into()
      .map_err(|e: std::num::TryFromIntError| ParseError::CastingError {
        context: "Unsubscribe::serialize",
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

    if payload.remaining() < 1 {
      return Err(ParseError::NotEnoughBytes {
        context: "FetchOk::parse_payload(group_order)",
        needed: 1,
        available: 0,
      });
    }
    let group_order_raw = payload.get_u8();
    let group_order = GroupOrder::try_from(group_order_raw)?;
    if let GroupOrder::Original = group_order {
      return Err(ParseError::ProcotolViolation {
        context: "FetchOk::parse_payload(group_order)",
        details: "Group order must be Ascending(0x01) or Descending(0x02)".to_string(),
      });
    }

    if payload.remaining() < 1 {
      return Err(ParseError::NotEnoughBytes {
        context: "FetchOk::parse_payload(end_of_track)",
        needed: 1,
        available: 0,
      });
    }
    let end_of_track_raw = payload.get_u8();
    let mut end_of_track = false;
    match end_of_track_raw {
      0 => {}
      1 => {
        end_of_track = true;
      }
      _ => {
        return Err(ParseError::ProcotolViolation {
          context: "FetchOk::parse_payload(end_of_track)",
          details: format!("Invalid value for end of track {end_of_track_raw}"),
        });
      }
    }

    let end_location = Location::deserialize(payload)?;

    let param_count = payload.get_vi()?;

    let mut subscribe_parameters = Vec::new();
    for _ in 0..param_count {
      let param = KeyValuePair::deserialize(payload)?;
      subscribe_parameters.push(param);
    }

    Ok(Box::new(FetchOk {
      request_id,
      group_order,
      end_of_track,
      end_location,
      subscribe_parameters,
    }))
  }

  fn get_type(&self) -> ControlMessageType {
    ControlMessageType::FetchOk
  }
}

#[cfg(test)]
mod tests {

  use super::*;
  use bytes::Buf;

  #[test]
  fn test_roundtrip() {
    let request_id = 271828;
    let group_order = GroupOrder::Ascending;
    let end_of_track = true;
    let end_location = Location {
      group: 17,
      object: 57,
    };
    let subscribe_parameters = vec![
      KeyValuePair::try_new_varint(4444, 12321).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"fetch me ok")).unwrap(),
    ];
    let fetch_ok = FetchOk {
      request_id,
      group_order,
      end_of_track,
      end_location,
      subscribe_parameters,
    };
    let mut buf = fetch_ok.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::FetchOk as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());
    let deserialized = FetchOk::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, fetch_ok);
    assert!(!buf.has_remaining());
  }

  #[test]
  fn test_excess_roundtrip() {
    let request_id = 271828;
    let group_order = GroupOrder::Ascending;
    let end_of_track = true;
    let end_location = Location {
      group: 17,
      object: 57,
    };
    let subscribe_parameters = vec![
      KeyValuePair::try_new_varint(4444, 12321).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"fetch me ok")).unwrap(),
    ];
    let fetch_ok = FetchOk {
      request_id,
      group_order,
      end_of_track,
      end_location,
      subscribe_parameters,
    };

    let serialized = fetch_ok.serialize().unwrap();
    let mut excess = BytesMut::new();
    excess.extend_from_slice(&serialized);
    excess.extend_from_slice(&[9u8, 1u8, 1u8]);
    let mut buf = excess.freeze();

    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::FetchOk as u64);
    let msg_length = buf.get_u16();

    assert_eq!(msg_length as usize, buf.remaining() - 3);
    let deserialized = FetchOk::parse_payload(&mut buf).unwrap();
    assert_eq!(*deserialized, fetch_ok);
    assert_eq!(buf.chunk(), &[9u8, 1u8, 1u8]);
  }

  #[test]
  fn test_partial_message() {
    let request_id = 271828;
    let group_order = GroupOrder::Ascending;
    let end_of_track = true;
    let end_location = Location {
      group: 17,
      object: 57,
    };
    let subscribe_parameters = vec![
      KeyValuePair::try_new_varint(4444, 12321).unwrap(),
      KeyValuePair::try_new_bytes(1, Bytes::from_static(b"fetch me ok")).unwrap(),
    ];
    let fetch_ok = FetchOk {
      request_id,
      group_order,
      end_of_track,
      end_location,
      subscribe_parameters,
    };
    let mut buf = fetch_ok.serialize().unwrap();
    let msg_type = buf.get_vi().unwrap();
    assert_eq!(msg_type, ControlMessageType::FetchOk as u64);
    let msg_length = buf.get_u16();
    assert_eq!(msg_length as usize, buf.remaining());

    let upper = buf.remaining() / 2;
    let mut partial = buf.slice(..upper);
    let deserialized = FetchOk::parse_payload(&mut partial);
    assert!(deserialized.is_err());
  }
}
