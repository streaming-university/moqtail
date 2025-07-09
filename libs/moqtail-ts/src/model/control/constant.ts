import { CastingError } from '../error'

export const DRAFT_11 = 0xff00000b

export enum ControlMessageType {
  ReservedSetupV00 = 0x01,
  ReservedClientSetupV10 = 0x40,
  ReservedServerSetupV10 = 0x41,
  ClientSetup = 0x20,
  ServerSetup = 0x21,
  GoAway = 0x10,
  MaxRequestId = 0x15,
  RequestsBlocked = 0x1a,
  Subscribe = 0x03,
  SubscribeOk = 0x04,
  SubscribeError = 0x05,
  Unsubscribe = 0x0a,
  SubscribeUpdate = 0x02,
  SubscribeDone = 0x0b,
  Fetch = 0x16,
  FetchOk = 0x18,
  FetchError = 0x19,
  FetchCancel = 0x17,
  TrackStatusRequest = 0x0d,
  TrackStatus = 0x0e,
  Announce = 0x06,
  AnnounceOk = 0x07,
  AnnounceError = 0x08,
  Unannounce = 0x09,
  AnnounceCancel = 0x0c,
  SubscribeAnnounces = 0x11,
  SubscribeAnnouncesOk = 0x12,
  SubscribeAnnouncesError = 0x13,
  UnsubscribeAnnounces = 0x14,
}

export function controlMessageTypeFromBigInt(v: bigint): ControlMessageType {
  switch (v) {
    case 0x01n:
      return ControlMessageType.ReservedSetupV00
    case 0x40n:
      return ControlMessageType.ReservedClientSetupV10
    case 0x41n:
      return ControlMessageType.ReservedServerSetupV10
    case 0x20n:
      return ControlMessageType.ClientSetup
    case 0x21n:
      return ControlMessageType.ServerSetup
    case 0x10n:
      return ControlMessageType.GoAway
    case 0x15n:
      return ControlMessageType.MaxRequestId
    case 0x1an:
      return ControlMessageType.RequestsBlocked
    case 0x03n:
      return ControlMessageType.Subscribe
    case 0x04n:
      return ControlMessageType.SubscribeOk
    case 0x05n:
      return ControlMessageType.SubscribeError
    case 0x0an:
      return ControlMessageType.Unsubscribe
    case 0x02n:
      return ControlMessageType.SubscribeUpdate
    case 0x0bn:
      return ControlMessageType.SubscribeDone
    case 0x16n:
      return ControlMessageType.Fetch
    case 0x18n:
      return ControlMessageType.FetchOk
    case 0x19n:
      return ControlMessageType.FetchError
    case 0x17n:
      return ControlMessageType.FetchCancel
    case 0x0dn:
      return ControlMessageType.TrackStatusRequest
    case 0x0en:
      return ControlMessageType.TrackStatus
    case 0x06n:
      return ControlMessageType.Announce
    case 0x07n:
      return ControlMessageType.AnnounceOk
    case 0x08n:
      return ControlMessageType.AnnounceError
    case 0x09n:
      return ControlMessageType.Unannounce
    case 0x0cn:
      return ControlMessageType.AnnounceCancel
    case 0x11n:
      return ControlMessageType.SubscribeAnnounces
    case 0x12n:
      return ControlMessageType.SubscribeAnnouncesOk
    case 0x13n:
      return ControlMessageType.SubscribeAnnouncesError
    case 0x14n:
      return ControlMessageType.UnsubscribeAnnounces
    default:
      throw new Error(`Invalid ControlMessageType: ${v}`)
  }
}

export enum AnnounceErrorCode {
  InternalError = 0x0,
  Unauthorized = 0x1,
  Timeout = 0x2,
  NotSupported = 0x3,
  Uninterested = 0x4,
  MalformedAuthToken = 0x10,
  UnknownAuthTokenAlias = 0x11,
  ExpiredAuthToken = 0x12,
}

export function announceErrorCodeFromBigInt(v: bigint): AnnounceErrorCode {
  switch (v) {
    case 0x0n:
      return AnnounceErrorCode.InternalError
    case 0x1n:
      return AnnounceErrorCode.Unauthorized
    case 0x2n:
      return AnnounceErrorCode.Timeout
    case 0x3n:
      return AnnounceErrorCode.NotSupported
    case 0x4n:
      return AnnounceErrorCode.Uninterested
    case 0x10n:
      return AnnounceErrorCode.MalformedAuthToken
    case 0x11n:
      return AnnounceErrorCode.UnknownAuthTokenAlias
    case 0x12n:
      return AnnounceErrorCode.ExpiredAuthToken
    default:
      throw new Error(`Invalid AnnounceErrorCode: ${v}`)
  }
}

export enum FilterType {
  NextGroupStart = 0x1,
  LatestObject = 0x2,
  AbsoluteStart = 0x3,
  AbsoluteRange = 0x4,
}
export function filterTypeFromBigInt(v: bigint): FilterType {
  switch (v) {
    case 0x1n:
      return FilterType.NextGroupStart
    case 0x2n:
      return FilterType.LatestObject
    case 0x3n:
      return FilterType.AbsoluteStart
    case 0x4n:
      return FilterType.AbsoluteRange
    default:
      throw new Error(`Invalid FilterType: ${v}`)
  }
}

export enum FetchType {
  StandAlone = 0x1,
  Relative = 0x2,
  Absolute = 0x3,
}
export function fetchTypeFromBigInt(v: bigint): FetchType {
  switch (v) {
    case 0x1n:
      return FetchType.StandAlone
    case 0x2n:
      return FetchType.Relative
    case 0x3n:
      return FetchType.Absolute
    default:
      throw new CastingError('fetchTypeFromBigInt', 'bigint', 'FetchType', `Invalid FetchType:${v}`)
  }
}

export enum GroupOrder {
  Original = 0x0,
  Ascending = 0x1,
  Descending = 0x2,
}
export function groupOrderFromNumber(v: number): GroupOrder {
  switch (v) {
    case 0x0:
      return GroupOrder.Original
    case 0x1:
      return GroupOrder.Ascending
    case 0x2:
      return GroupOrder.Descending
    default:
      throw new CastingError('groupOrderFromNumber', 'number', 'GroupOrder', `Invalid GroupOrder: ${v}`)
  }
}

export enum SubscribeErrorCode {
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
export function subscribeErrorCodeFromBigInt(v: bigint): SubscribeErrorCode {
  switch (v) {
    case 0x0n:
      return SubscribeErrorCode.InternalError
    case 0x1n:
      return SubscribeErrorCode.Unauthorized
    case 0x2n:
      return SubscribeErrorCode.Timeout
    case 0x3n:
      return SubscribeErrorCode.NotSupported
    case 0x4n:
      return SubscribeErrorCode.TrackDoesNotExist
    case 0x5n:
      return SubscribeErrorCode.InvalidRange
    case 0x6n:
      return SubscribeErrorCode.RetryTrackAlias
    case 0x10n:
      return SubscribeErrorCode.MalformedAuthToken
    case 0x11n:
      return SubscribeErrorCode.UnknownAuthTokenAlias
    case 0x12n:
      return SubscribeErrorCode.ExpiredAuthToken
    default:
      throw new Error(`Invalid SubscribeErrorCode: ${v}`)
  }
}

export enum FetchErrorCode {
  InternalError = 0x0,
  Unauthorized = 0x1,
  Timeout = 0x2,
  NotSupported = 0x3,
  TrackDoesNotExist = 0x4,
  InvalidRange = 0x5,
}
export function fetchErrorCodeFromBigInt(v: bigint): FetchErrorCode {
  switch (v) {
    case 0x0n:
      return FetchErrorCode.InternalError
    case 0x1n:
      return FetchErrorCode.Unauthorized
    case 0x2n:
      return FetchErrorCode.Timeout
    case 0x3n:
      return FetchErrorCode.NotSupported
    case 0x4n:
      return FetchErrorCode.TrackDoesNotExist
    case 0x5n:
      return FetchErrorCode.InvalidRange
    default:
      throw new CastingError('fetchErrorCodeFromBigInt', 'number', 'FetchErrorCode', 'Invalid fetch error code')
  }
}

export enum TrackStatusCode {
  InProgress = 0x00,
  DoesNotExist = 0x01,
  NotYetBegun = 0x02,
  Finished = 0x03,
  RelayUnavailable = 0x04,
}
export function trackStatusCodeFromBigInt(v: bigint): TrackStatusCode {
  switch (v) {
    case 0x00n:
      return TrackStatusCode.InProgress
    case 0x01n:
      return TrackStatusCode.DoesNotExist
    case 0x02n:
      return TrackStatusCode.NotYetBegun
    case 0x03n:
      return TrackStatusCode.Finished
    case 0x04n:
      return TrackStatusCode.RelayUnavailable
    default:
      throw new Error(`Invalid TrackStatusCode: ${v}`)
  }
}

export enum SubscribeAnnouncesErrorCode {
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
export function subscribeAnnouncesErrorCodeFromBigInt(v: bigint): SubscribeAnnouncesErrorCode {
  switch (v) {
    case 0x0n:
      return SubscribeAnnouncesErrorCode.InternalError
    case 0x1n:
      return SubscribeAnnouncesErrorCode.Unauthorized
    case 0x2n:
      return SubscribeAnnouncesErrorCode.Timeout
    case 0x3n:
      return SubscribeAnnouncesErrorCode.NotSupported
    case 0x4n:
      return SubscribeAnnouncesErrorCode.NamespacePrefixUnknown
    case 0x5n:
      return SubscribeAnnouncesErrorCode.NamespacePrefixOverlap
    case 0x10n:
      return SubscribeAnnouncesErrorCode.MalformedAuthToken
    case 0x11n:
      return SubscribeAnnouncesErrorCode.UnknownAuthTokenAlias
    case 0x12n:
      return SubscribeAnnouncesErrorCode.ExpiredAuthToken
    default:
      throw new Error(`Invalid SubscribeAnnouncesErrorCode: ${v}`)
  }
}

export enum SubscribeDoneStatusCode {
  InternalError = 0x0,
  Unauthorized = 0x1,
  TrackEnded = 0x2,
  SubscriptionEnded = 0x3,
  GoingAway = 0x4,
  Expired = 0x5,
  TooFarBehind = 0x6,
}
export function subscribeDoneStatusCodeFromBigInt(v: bigint): SubscribeDoneStatusCode {
  switch (v) {
    case 0x0n:
      return SubscribeDoneStatusCode.InternalError
    case 0x1n:
      return SubscribeDoneStatusCode.Unauthorized
    case 0x2n:
      return SubscribeDoneStatusCode.TrackEnded
    case 0x3n:
      return SubscribeDoneStatusCode.SubscriptionEnded
    case 0x4n:
      return SubscribeDoneStatusCode.GoingAway
    case 0x5n:
      return SubscribeDoneStatusCode.Expired
    case 0x6n:
      return SubscribeDoneStatusCode.TooFarBehind
    default:
      throw new Error(`Invalid SubscribeDoneStatusCode: ${v}`)
  }
}
