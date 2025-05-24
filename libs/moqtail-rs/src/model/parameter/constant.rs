use crate::model::error::ParseError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u64)]
pub enum SetupParameterType {
  Path = 0x01,
  MaxRequestId = 0x02,
  MaxAuthTokenCacheSize = 0x04,
}

impl TryFrom<u64> for SetupParameterType {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x01 => Ok(SetupParameterType::Path),
      0x02 => Ok(SetupParameterType::MaxRequestId),
      0x04 => Ok(SetupParameterType::MaxAuthTokenCacheSize),
      _ => Err(ParseError::InvalidType {
        context: "SetupParameterType::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<SetupParameterType> for u64 {
  fn from(value: SetupParameterType) -> Self {
    value as u64
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u64)]
pub enum VersionSpecificParameterType {
  AuthorizationToken = 0x01,
  DeliveryTimeout = 0x02,
  MaxCacheDuration = 0x04,
}

impl TryFrom<u64> for VersionSpecificParameterType {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x01 => Ok(VersionSpecificParameterType::AuthorizationToken),
      0x02 => Ok(VersionSpecificParameterType::DeliveryTimeout),
      0x04 => Ok(VersionSpecificParameterType::MaxCacheDuration),
      _ => Err(ParseError::InvalidType {
        context: "VersionSpecificParameterType::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<VersionSpecificParameterType> for u64 {
  fn from(value: VersionSpecificParameterType) -> Self {
    value as u64
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u64)]
pub enum TokenAliasType {
  Delete = 0x0,
  Register = 0x1,
  UseAlias = 0x2,
  UseValue = 0x3,
}
impl TryFrom<u64> for TokenAliasType {
  type Error = ParseError;

  fn try_from(value: u64) -> Result<Self, Self::Error> {
    match value {
      0x0 => Ok(TokenAliasType::Delete),
      0x1 => Ok(TokenAliasType::Register),
      0x2 => Ok(TokenAliasType::UseAlias),
      0x3 => Ok(TokenAliasType::UseValue),
      _ => Err(ParseError::InvalidType {
        context: "TokenAliasType::try_from(u64)",
        details: format!("Invalid type, got {value}"),
      }),
    }
  }
}

impl From<TokenAliasType> for u64 {
  fn from(value: TokenAliasType) -> Self {
    value as u64
  }
}
