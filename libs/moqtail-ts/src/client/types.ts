import {
  TrackStatusRequest,
  FullTrackName,
  GroupOrder,
  FilterType,
  VersionSpecificParameters,
  FetchType,
  Location,
  SetupParameters,
  ControlMessage,
} from '@/model'
import { AnnounceRequest } from './request/announce'
import { FetchRequest } from './request/fetch'
import { SubscribeRequest } from './request/subscribe'
import { SubscribeAnnouncesRequest } from './request/subscribe_announces'

export type MoqtailRequest =
  | AnnounceRequest
  | SubscribeAnnouncesRequest
  | FetchRequest
  | SubscribeRequest
  | TrackStatusRequest

export type MoqtailClientOptions = {
  url: string | URL
  supportedVersions: number[]
  setupParameters?: SetupParameters
  transportOptions?: WebTransportOptions
  dataStreamTimeoutMs?: number
  controlStreamTimeoutMs?: number
  callbacks?: {
    onMessageSent?: (msg: ControlMessage) => void
    onMessageReceived?: (msg: ControlMessage) => void
    onSessionTerminated?: (reason?: unknown) => void
  }
}

export type SubscribeOptions = {
  fullTrackName: FullTrackName
  priority: number // 0 is highest, 255 is lowest. Values are rounded to nearest integer then clamped between 0 and 255
  groupOrder: GroupOrder
  forward: boolean
  filterType: FilterType
  parameters?: VersionSpecificParameters
  trackAlias?: bigint | number
  startLocation?: Location
  endGroup?: bigint | number
}
export type SubscribeUpdateOptions = {
  requestId: bigint
  startLocation: Location
  endGroup: bigint
  priority: number // 0 is highest, 255 is lowest. Values are rounded to nearest integer then clamped between 0 and 255
  forward: boolean
  parameters?: VersionSpecificParameters
}
export type FetchOptions = {
  priority: number // 0 is highest, 255 is lowest. Values are rounded to nearest integer then clamped between 0 and 255
  groupOrder: GroupOrder
  typeAndProps:
    | {
        type: FetchType.StandAlone
        props: { fullTrackName: FullTrackName; startLocation: Location; endLocation: Location }
      }
    | {
        type: FetchType.Relative
        props: { joiningRequestId: bigint; joiningStart: bigint }
      }
    | {
        type: FetchType.Absolute
        props: { joiningRequestId: bigint; joiningStart: bigint }
      }
  parameters?: VersionSpecificParameters
}
