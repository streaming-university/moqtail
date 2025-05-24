use core::convert::From;
<<""
pub const DRAFT_11: u32 = 0xFF00000B;

#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u8)]
pub enum ControlMessageType {
  Unknown = 0x00, // To handle unknown types
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

impl From<u8> for ControlMessageType {
  fn from(value: u8) -> Self {
    match value {
      0x01 => ControlMessageType::ReservedSetupV00,
      0x40 => ControlMessageType::ReservedClientSetupV10,
      0x41 => ControlMessageType::ReservedServerSetupV10,
      0x20 => ControlMessageType::ClientSetup,
      0x21 => ControlMessageType::ServerSetup,
      0x10 => ControlMessageType::GoAway,
      0x15 => ControlMessageType::MaxRequestId,
      0x1A => ControlMessageType::RequestsBlocked,
      0x03 => ControlMessageType::Subscribe,
      0x04 => ControlMessageType::SubscribeOk,
      0x05 => ControlMessageType::SubscribeError,
      0x0A => ControlMessageType::Unsubscribe,
      0x02 => ControlMessageType::SubscribeUpdate,
      0x0B => ControlMessageType::SubscribeDone,
      0x16 => ControlMessageType::Fetch,
      0x18 => ControlMessageType::FetchOk,
      0x19 => ControlMessageType::FetchError,
      0x17 => ControlMessageType::FetchCancel,
      0x0D => ControlMessageType::TrackStatusRequest,
      0x0E => ControlMessageType::TrackStatus,
      0x06 => ControlMessageType::Announce,
      0x07 => ControlMessageType::AnnounceOk,
      0x08 => ControlMessageType::AnnounceError,
      0x09 => ControlMessageType::Unannounce,
      0x0C => ControlMessageType::AnnounceCancel,
      0x11 => ControlMessageType::SubscribeAnnounces,
      0x12 => ControlMessageType::SubscribeAnnouncesOk,
      0x13 => ControlMessageType::SubscribeAnnouncesError,
      0x14 => ControlMessageType::UnsubscribeAnnounces,
      _ => ControlMessageType::Unknown, // Default case for unknown types, including 0x00
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u64)]
pub enum SetupMessageType {
  Unknown = 0x00, // To handle unknown types
  Path = 0x01,
  MaxSubscriberId = 0x02,
}

impl From<u8> for SetupMessageType {
  fn from(value: u8) -> Self {
    match value {
      0x01 => SetupMessageType::Path,
      0x02 => SetupMessageType::MaxSubscriberId,
      _ => SetupMessageType::Unknown,
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u64)]
pub enum FilterType {
  LatestObject = 0x2,
  AbsoluteStart = 0x3,
  AbsoluteRange = 0x4,
  Unknown = 0xF,
}

impl From<u64> for FilterType {
  fn from(value: u64) -> Self {
    match value {
      0x2 => FilterType::LatestObject,
      0x3 => FilterType::AbsoluteStart,
      0x4 => FilterType::AbsoluteRange,
      _ => FilterType::Unknown,
    }
  }
}
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u64)]
pub enum FetchType {
  StandAlone = 0x1,
  Joining = 0x2,
  Unknown = 0xF,
}

impl From<u64> for FetchType {
  fn from(value: u64) -> Self {
    match value {
      0x1 => FetchType::StandAlone,
      0x2 => FetchType::Joining,
      _ => FetchType::Unknown,
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u8)]
pub enum GroupOrder {
  Original = 0x0,
  Ascending = 0x1,
  Descending = 0x2,
  Unknown = 0xF,
}

impl From<u8> for GroupOrder {
  fn from(value: u8) -> Self {
    match value {
      0x0 => GroupOrder::Original,
      0x1 => GroupOrder::Ascending,
      0x2 => GroupOrder::Descending,
      _ => GroupOrder::Unknown,
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u8)]
pub enum EndOfTrack {
  AllObjectsNotPublished = 0x0,
  AllObjectsPublished = 0x1,
  Unknown = 0xF,
}
impl From<u8> for EndOfTrack {
  fn from(value: u8) -> Self {
    match value {
      0x0 => EndOfTrack::AllObjectsNotPublished,
      0x1 => EndOfTrack::AllObjectsPublished,
      _ => EndOfTrack::Unknown,
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum ParameterType {
  AuthorizationInfo = 0x02,
  DeliveryTimeout = 0x03,
  MaxCacheDuration = 0x04,
  Unknown = 0xFF,
}

impl From<u8> for ParameterType {
  fn from(value: u8) -> Self {
    match value {
      0x02 => ParameterType::AuthorizationInfo,
      0x03 => ParameterType::DeliveryTimeout,
      0x04 => ParameterType::MaxCacheDuration,
      _ => ParameterType::Unknown,
    }
  }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum SubscribeParameterType {
  AuthorizationInfo = 0x02,
  DeliveryTimeout = 0x03,
  MaxCacheDuration = 0x04,
  Unknown = 0xFF,
}

impl From<u8> for SubscribeParameterType {
  fn from(value: u8) -> Self {
    match value {
      0x02 => SubscribeParameterType::AuthorizationInfo,
      0x03 => SubscribeParameterType::DeliveryTimeout,
      0x04 => SubscribeParameterType::MaxCacheDuration,
      _ => SubscribeParameterType::Unknown,
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum FetchParameterType {
  AuthorizationInfo = 0x02,
  DeliveryTimeout = 0x03,
  MaxCacheDuration = 0x04,
  Unknown = 0xFF,
}

impl From<u8> for FetchParameterType {
  fn from(value: u8) -> Self {
    match value {
      0x02 => FetchParameterType::AuthorizationInfo,
      0x03 => FetchParameterType::DeliveryTimeout,
      0x04 => FetchParameterType::MaxCacheDuration,
      _ => FetchParameterType::Unknown,
    }
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
  Unknown = 0xF,
}

impl From<u64> for SubscribeErrorCode {
  fn from(value: u64) -> Self {
    match value {
      0x0 => SubscribeErrorCode::InternalError,
      0x1 => SubscribeErrorCode::Unauthorized,
      0x2 => SubscribeErrorCode::Timeout,
      0x3 => SubscribeErrorCode::NotSupported,
      0x4 => SubscribeErrorCode::TrackDoesNotExist,
      0x5 => SubscribeErrorCode::InvalidRange,
      0x6 => SubscribeErrorCode::RetryTrackAlias,
      _ => SubscribeErrorCode::Unknown,
    }
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
  Unknown = 0xF,
}

impl From<u64> for FetchErrorCode {
  fn from(value: u64) -> Self {
    match value {
      0x0 => FetchErrorCode::InternalError,
      0x1 => FetchErrorCode::Unauthorized,
      0x2 => FetchErrorCode::Timeout,
      0x3 => FetchErrorCode::NotSupported,
      0x4 => FetchErrorCode::TrackDoesNotExist,
      0x5 => FetchErrorCode::InvalidRange,
      _ => FetchErrorCode::Unknown,
    }
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
  Unknown = 0xFF,
}

impl From<u64> for TrackStatusCode {
  fn from(value: u64) -> Self {
    match value {
      0x00 => TrackStatusCode::InProgress,
      0x01 => TrackStatusCode::DoesNotExist,
      0x02 => TrackStatusCode::NotYetBegun,
      0x03 => TrackStatusCode::Finished,
      0x04 => TrackStatusCode::RelayUnavailable,
      _ => TrackStatusCode::Unknown,
    }
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
  Unknown = 0xFF,
}

impl From<u64> for SubscribeAnnouncesErrorCode {
  fn from(value: u64) -> Self {
    match value {
      0x0 => SubscribeAnnouncesErrorCode::InternalError,
      0x1 => SubscribeAnnouncesErrorCode::Unauthorized,
      0x2 => SubscribeAnnouncesErrorCode::Timeout,
      0x3 => SubscribeAnnouncesErrorCode::NotSupported,
      0x4 => SubscribeAnnouncesErrorCode::NamespacePrefixUnknown,
      _ => SubscribeAnnouncesErrorCode::Unknown,
    }
  }
}
