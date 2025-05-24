use core::convert::From;

use crate::model::error::ParseError;

pub const DRAFT_11: u32 = 0xFF00000B;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u64)]
pub enum ControlMessageType {
  ReservedSetupV00 = 0x01,
  ReservedClientSetupV10 = 0x40,
  ReservedServerSetupV10 = 0x41,
  ClientSetup = 0x20,
  ServerSetup = 0x21,
  GoAway = 0x10,
  MaxRequestId = 0x15,
  RequestsBlocked = 0x1A,
  Subscribe = 0x03,
  SubscribeOk = 0x04,
  SubscribeError = 0x05,
  Unsubscribe = 0x0A,
  SubscribeUpdate = 0x02,
  SubscribeDone = 0x0B,
  Fetch = 0x16,
  FetchOk = 0x18,
  FetchError = 0x19,
  FetchCancel = 0x17,
  TrackStatusRequest = 0x0D,
  TrackStatus = 0x0E,
  Announce = 0x06,
  AnnounceOk = 0x07,
  AnnounceError = 0x08,
  Unannounce = 0x09,
  AnnounceCancel = 0x0C,
  SubscribeAnnounces = 0x11,
  SubscribeAnnouncesOk = 0x12,
  SubscribeAnnouncesError = 0x13,
  UnsubscribeAnnounces = 0x14,
}

impl TryFrom<u64> for ControlMessageType {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x01 => Ok(ControlMessageType::ReservedSetupV00),
      0x40 => Ok(ControlMessageType::ReservedClientSetupV10),
      0x41 => Ok(ControlMessageType::ReservedServerSetupV10),
      0x20 => Ok(ControlMessageType::ClientSetup),
      0x21 => Ok(ControlMessageType::ServerSetup),
      0x10 => Ok(ControlMessageType::GoAway),
      0x15 => Ok(ControlMessageType::MaxRequestId),
      0x1A => Ok(ControlMessageType::RequestsBlocked),
      0x03 => Ok(ControlMessageType::Subscribe),
      0x04 => Ok(ControlMessageType::SubscribeOk),
      0x05 => Ok(ControlMessageType::SubscribeError),
      0x0A => Ok(ControlMessageType::Unsubscribe),
      0x02 => Ok(ControlMessageType::SubscribeUpdate),
      0x0B => Ok(ControlMessageType::SubscribeDone),
      0x16 => Ok(ControlMessageType::Fetch),
      0x18 => Ok(ControlMessageType::FetchOk),
      0x19 => Ok(ControlMessageType::FetchError),
      0x17 => Ok(ControlMessageType::FetchCancel),
      0x0D => Ok(ControlMessageType::TrackStatusRequest),
      0x0E => Ok(ControlMessageType::TrackStatus),
      0x06 => Ok(ControlMessageType::Announce),
      0x07 => Ok(ControlMessageType::AnnounceOk),
      0x08 => Ok(ControlMessageType::AnnounceError),
      0x09 => Ok(ControlMessageType::Unannounce),
      0x0C => Ok(ControlMessageType::AnnounceCancel),
      0x11 => Ok(ControlMessageType::SubscribeAnnounces),
      0x12 => Ok(ControlMessageType::SubscribeAnnouncesOk),
      0x13 => Ok(ControlMessageType::SubscribeAnnouncesError),
      0x14 => Ok(ControlMessageType::UnsubscribeAnnounces),
      _ => Err(ParseError::InvalidType {
        context: " ControlMessageType::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<ControlMessageType> for u64 {
  fn from(value: ControlMessageType) -> Self {
    value as u64
  }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u64)]
pub enum FilterType {
  NextGroupStart = 0x1,
  LatestObject = 0x2,
  AbsoluteStart = 0x3,
  AbsoluteRange = 0x4,
}

impl TryFrom<u64> for FilterType {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x1 => Ok(FilterType::NextGroupStart),
      0x2 => Ok(FilterType::LatestObject),
      0x3 => Ok(FilterType::AbsoluteStart),
      0x4 => Ok(FilterType::AbsoluteRange),
      _ => Err(ParseError::InvalidType {
        context: "FilterType::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<FilterType> for u64 {
  fn from(value: FilterType) -> Self {
    value as u64
  }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u64)]
pub enum FetchType {
  StandAlone = 0x1,
  RelativeFetch = 0x2,
  AbsoluteFetch = 0x3,
}

impl TryFrom<u64> for FetchType {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x1 => Ok(FetchType::StandAlone),
      0x2 => Ok(FetchType::RelativeFetch),
      0x3 => Ok(FetchType::AbsoluteFetch),
      _ => Err(ParseError::InvalidType {
        context: "FetchType::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<FetchType> for u64 {
  fn from(value: FetchType) -> Self {
    value as u64
  }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u8)]
pub enum GroupOrder {
  Original = 0x0,
  Ascending = 0x1,
  Descending = 0x2,
}

impl TryFrom<u8> for GroupOrder {
  type Error = ParseError;

  fn try_from(value: u8) -> Result<Self, Self::Error> {
    match value {
      0x0 => Ok(GroupOrder::Original),
      0x1 => Ok(GroupOrder::Ascending),
      0x2 => Ok(GroupOrder::Descending),
      _ => Err(ParseError::InvalidType {
        context: "GroupOrder::try_from(u8)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<GroupOrder> for u8 {
  fn from(value: GroupOrder) -> Self {
    value as u8
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u64)]
pub enum SubscribeErrorCode {
  InternalError = 0x0,
  Unauthorized = 0x1,
  Timeout = 0x2,
  NotSupported = 0x3,
  TrackDoesNotExist = 0x4,
  InvalidRange = 0x5,
  RetryTrackAlias = 0x6,
  MalformedAuthToken = 0x10,
  UnknownAuthTokenAlias = 0x11,
  ExpiredAuthToken = 0x12,
}

impl TryFrom<u64> for SubscribeErrorCode {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x0 => Ok(SubscribeErrorCode::InternalError),
      0x1 => Ok(SubscribeErrorCode::Unauthorized),
      0x2 => Ok(SubscribeErrorCode::Timeout),
      0x3 => Ok(SubscribeErrorCode::NotSupported),
      0x4 => Ok(SubscribeErrorCode::TrackDoesNotExist),
      0x5 => Ok(SubscribeErrorCode::InvalidRange),
      0x6 => Ok(SubscribeErrorCode::RetryTrackAlias),
      0x10 => Ok(SubscribeErrorCode::MalformedAuthToken),
      0x11 => Ok(SubscribeErrorCode::UnknownAuthTokenAlias),
      0x12 => Ok(SubscribeErrorCode::ExpiredAuthToken),
      _ => Err(ParseError::InvalidType {
        context: "SubscribeErrorCode::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<SubscribeErrorCode> for u64 {
  fn from(value: SubscribeErrorCode) -> Self {
    value as u64
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u64)]
pub enum FetchErrorCode {
  InternalError = 0x0,
  Unauthorized = 0x1,
  Timeout = 0x2,
  NotSupported = 0x3,
  TrackDoesNotExist = 0x4,
  InvalidRange = 0x5,
}

impl TryFrom<u64> for FetchErrorCode {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x0 => Ok(FetchErrorCode::InternalError),
      0x1 => Ok(FetchErrorCode::Unauthorized),
      0x2 => Ok(FetchErrorCode::Timeout),
      0x3 => Ok(FetchErrorCode::NotSupported),
      0x4 => Ok(FetchErrorCode::TrackDoesNotExist),
      0x5 => Ok(FetchErrorCode::InvalidRange),
      _ => Err(ParseError::InvalidType {
        context: "FetchErrorCode::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<FetchErrorCode> for u64 {
  fn from(value: FetchErrorCode) -> Self {
    value as u64
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u64)]
pub enum TrackStatusCode {
  InProgress = 0x00,
  DoesNotExist = 0x01,
  NotYetBegun = 0x02,
  Finished = 0x03,
  RelayUnavailable = 0x04,
}

impl TryFrom<u64> for TrackStatusCode {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x00 => Ok(TrackStatusCode::InProgress),
      0x01 => Ok(TrackStatusCode::DoesNotExist),
      0x02 => Ok(TrackStatusCode::NotYetBegun),
      0x03 => Ok(TrackStatusCode::Finished),
      0x04 => Ok(TrackStatusCode::RelayUnavailable),
      _ => Err(ParseError::InvalidType {
        context: "TrackStatusCode::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<TrackStatusCode> for u64 {
  fn from(value: TrackStatusCode) -> Self {
    value as u64
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u64)]
pub enum SubscribeAnnouncesErrorCode {
  InternalError = 0x0,
  Unauthorized = 0x1,
  Timeout = 0x2,
  NotSupported = 0x3,
  NamespacePrefixUnknown = 0x4,
  NamespacePrefixOverlap = 0x5,
  MalformedAuthToken = 0x10,
  UnknownAuthTokenAlias = 0x11,
  ExpiredAuthToken = 0x12,
}
impl TryFrom<u64> for SubscribeAnnouncesErrorCode {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x0 => Ok(SubscribeAnnouncesErrorCode::InternalError),
      0x1 => Ok(SubscribeAnnouncesErrorCode::Unauthorized),
      0x2 => Ok(SubscribeAnnouncesErrorCode::Timeout),
      0x3 => Ok(SubscribeAnnouncesErrorCode::NotSupported),
      0x4 => Ok(SubscribeAnnouncesErrorCode::NamespacePrefixUnknown),
      0x5 => Ok(SubscribeAnnouncesErrorCode::NamespacePrefixOverlap),
      0x10 => Ok(SubscribeAnnouncesErrorCode::MalformedAuthToken),
      0x11 => Ok(SubscribeAnnouncesErrorCode::UnknownAuthTokenAlias),
      0x12 => Ok(SubscribeAnnouncesErrorCode::ExpiredAuthToken),
      _ => Err(ParseError::InvalidType {
        context: "SubscribeAnnouncesErrorCode::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<SubscribeAnnouncesErrorCode> for u64 {
  fn from(value: SubscribeAnnouncesErrorCode) -> Self {
    value as u64
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u64)]
pub enum SubscribeDoneStatusCode {
  InternalError = 0x0,
  Unauthorized = 0x1,
  TrackEnded = 0x2,
  SubscriptionEnded = 0x3,
  GoingAway = 0x4,
  Expired = 0x5,
  TooFarBehind = 0x6,
}
impl TryFrom<u64> for SubscribeDoneStatusCode {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x0 => Ok(SubscribeDoneStatusCode::InternalError),
      0x1 => Ok(SubscribeDoneStatusCode::Unauthorized),
      0x2 => Ok(SubscribeDoneStatusCode::TrackEnded),
      0x3 => Ok(SubscribeDoneStatusCode::SubscriptionEnded),
      0x4 => Ok(SubscribeDoneStatusCode::GoingAway),
      0x5 => Ok(SubscribeDoneStatusCode::Expired),
      0x6 => Ok(SubscribeDoneStatusCode::TooFarBehind),
      _ => Err(ParseError::InvalidType {
        context: "SubscribeDoneStatusCode::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<SubscribeDoneStatusCode> for u64 {
  fn from(value: SubscribeDoneStatusCode) -> Self {
    value as u64
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u64)]
pub enum AnnounceErrorCode {
  InternalError = 0x0,
  Unauthorized = 0x1,
  Timeout = 0x2,
  NotSupported = 0x3,
  Uninterested = 0x4,
  MalformedAuthToken = 0x10,
  UnknownAuthTokenAlias = 0x11,
  ExpiredAuthToken = 0x12,
}

impl TryFrom<u64> for AnnounceErrorCode {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x0 => Ok(AnnounceErrorCode::InternalError),
      0x1 => Ok(AnnounceErrorCode::Unauthorized),
      0x2 => Ok(AnnounceErrorCode::Timeout),
      0x3 => Ok(AnnounceErrorCode::NotSupported),
      0x4 => Ok(AnnounceErrorCode::Uninterested),
      0x10 => Ok(AnnounceErrorCode::MalformedAuthToken),
      0x11 => Ok(AnnounceErrorCode::UnknownAuthTokenAlias),
      0x12 => Ok(AnnounceErrorCode::ExpiredAuthToken),
      _ => Err(ParseError::InvalidType {
        context: "AnnounceErrorCode::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<AnnounceErrorCode> for u64 {
  fn from(value: AnnounceErrorCode) -> Self {
    value as u64
  }
}
