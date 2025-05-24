use crate::model::error::ParseError;
use bytes::{Buf, BufMut, Bytes, BytesMut};

pub trait BufVarIntExt {
  fn get_vi(&mut self) -> Result<u64, ParseError>;
}

pub trait BufMutVarIntExt<T> {
  fn put_vi(&mut self, value: T) -> Result<(), ParseError>;
}

impl BufVarIntExt for Bytes {
  fn get_vi(&mut self) -> Result<u64, ParseError> {
    if self.remaining() == 0 {
      return Err(ParseError::NotEnoughBytes {
        context: "varint first byte",
        needed: 1,
        available: 0,
      });
    }

    let first = self.get_u8();
    let num_bytes = match first >> 6 {
      0 => 1,
      1 => 2,
      2 => 4,
      3 => 8,
      _ => unreachable!(),
    };

    if self.remaining() + 1 < num_bytes {
      return Err(ParseError::NotEnoughBytes {
        context: "varint continuation",
        needed: num_bytes,
        available: self.remaining() + 1,
      });
    }

    let mut val = (u64::from(first & 0b0011_1111)) << ((num_bytes - 1) * 8);

    for i in 1..num_bytes {
      let byte = self.get_u8() as u64;
      let shift = (num_bytes - 1 - i) * 8;
      val |= byte << shift;
    }
    Ok(val)
  }
}
impl<T> BufMutVarIntExt<T> for BytesMut
where
  T: TryInto<u64>,
{
  fn put_vi(&mut self, value: T) -> Result<(), ParseError> {
    // first convert into u64 or return an error
    let v: u64 = value.try_into().map_err(|_| ParseError::CastingError {
      context: "varint put_vi",
      from_type: std::any::type_name::<T>(),
      to_type: "u64",
      details: String::new(),
    })?;

    // now choose the encoding length
    if v < 1 << 6 {
      self.put_u8(v as u8);
    } else if v < 1 << 14 {
      self.put_slice(&[((v >> 8) | 0b01_000000) as u8, v as u8]);
    } else if v < 1 << 30 {
      self.put_slice(&[
        ((v >> 24) | 0b10_000000) as u8,
        (v >> 16) as u8,
        (v >> 8) as u8,
        v as u8,
      ]);
    } else if v < 1 << 62 {
      self.put_slice(&[
        ((v >> 56) | 0b11_000000) as u8,
        (v >> 48) as u8,
        (v >> 40) as u8,
        (v >> 32) as u8,
        (v >> 24) as u8,
        (v >> 16) as u8,
        (v >> 8) as u8,
        v as u8,
      ]);
    } else {
      return Err(ParseError::VarIntOverflow {
        context: "varint put_vi",
        value: v,
      });
    }

    Ok(())
  }
}

#[cfg(test)]
mod tests {
  /*
  2MSB	Length	Usable Bits	Range
  00	1	6	0-63
  01	2	14	0-16383
  10	4	30	0-1073741823
  11	8	62	0-4611686018427387903
  */
  use super::*;
  use bytes::Bytes;

  #[test]
  fn test_encode() {
    let mut buf = BytesMut::new();
    buf.put_vi(0).unwrap();
    assert_eq!(buf.freeze(), Bytes::from(vec![0b00000000]));

    let mut buf = BytesMut::new();
    buf.put_vi(1).unwrap();
    assert_eq!(buf.freeze(), Bytes::from(vec![0b00000001]));

    let mut buf = BytesMut::new();
    buf.put_vi(127).unwrap();
    assert_eq!(buf.freeze(), Bytes::from(vec![0b01000000, 127]));

    let mut buf = BytesMut::new();
    buf.put_vi(128).unwrap();
    assert_eq!(buf.freeze(), Bytes::from(vec![0b01000000, 128]));

    let mut buf = BytesMut::new();
    buf.put_vi(300).unwrap();
    assert_eq!(buf.freeze(), Bytes::from(vec![0b01000001, 44]));

    let mut buf = BytesMut::new();
    buf.put_vi(63).unwrap();
    assert_eq!(buf.freeze(), Bytes::from(vec![0b00111111]));

    let mut buf = BytesMut::new();
    buf.put_vi(16383).unwrap();
    assert_eq!(buf.freeze(), Bytes::from(vec![0b01111111, 0xFF]));

    let mut buf = BytesMut::new();
    buf.put_vi(1073741823).unwrap();
    assert_eq!(
      buf.freeze(),
      Bytes::from(vec![0b10111111, 0xFF, 0xFF, 0xFF])
    );

    let mut buf = BytesMut::new();
    buf.put_vi(4611686018427387903u64).unwrap();
    assert_eq!(
      buf.freeze(),
      Bytes::from(vec![0b11111111, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
    );
  }

  #[test]
  fn test_ext_len() {
    let mut buf = Bytes::from(vec![
      64, 172, 45, 2, 192, 0, 0, 37, 138, 62, 225, 57, 4, 0, 13, 32, 1, 66, 192, 30, 255, 225, 0,
      17, 103, 66, 192, 30, 140, 104, 10, 3, 218, 106, 2, 2, 12, 15, 8, 132, 106, 1, 0, 4, 104,
      206, 60, 128, 77, 242,
    ]);
    assert_eq!(buf.get_vi().unwrap(), 172);
    assert_eq!(buf.get_vi().unwrap(), 45);
    assert_eq!(buf.get_vi().unwrap(), 2);
    assert_eq!(buf.get_vi().unwrap(), 161233166649);
    assert_eq!(buf.get_vi().unwrap(), 4);
    assert_eq!(buf.get_vi().unwrap(), 0);
    assert_eq!(buf.get_vi().unwrap(), 13);
  }

  #[test]
  fn test_decode() {
    let mut buf = Bytes::from(vec![0b00000000]);
    assert_eq!(buf.get_vi().unwrap(), 0);

    let mut buf = Bytes::from(vec![0b00000001]);
    assert_eq!(buf.get_vi().unwrap(), 1);

    let mut buf = Bytes::from(vec![0b01000000, 127]);
    assert_eq!(buf.get_vi().unwrap(), 127);

    let mut buf = Bytes::from(vec![0b01000000, 128]);
    assert_eq!(buf.get_vi().unwrap(), 128);

    let mut buf = Bytes::from(vec![0b01000001, 44]);
    assert_eq!(buf.get_vi().unwrap(), 300);

    let mut buf = Bytes::from(vec![0b00111111]);
    assert_eq!(buf.get_vi().unwrap(), 63);

    let mut buf = Bytes::from(vec![0b01111111, 0xFF]);
    assert_eq!(buf.get_vi().unwrap(), 16383);

    let mut buf = Bytes::from(vec![0b10111111, 0xFF, 0xFF, 0xFF]);
    assert_eq!(buf.get_vi().unwrap(), 1073741823);

    let mut buf = Bytes::from(vec![0b11111111, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
    assert_eq!(buf.get_vi().unwrap(), 4611686018427387903);
  }

  #[test]
  fn test_decode_invalid() {
    // test invalid encoding
    assert!(Bytes::from(vec![0b01000000]).get_vi().is_err());
    assert!(Bytes::from(vec![0b10000000]).get_vi().is_err());
    assert!(Bytes::from(vec![0b11000000]).get_vi().is_err());
    assert!(Bytes::from(vec![0b11100000]).get_vi().is_err());
    assert!(Bytes::from(vec![0b11110000]).get_vi().is_err());
  }
}
