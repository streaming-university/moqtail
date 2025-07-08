export interface RoomState {
  id: number
  name: string
  users: Map<string, RoomUser>
  created: number // timestamp
}

export interface RoomStateView {
  id: number
  name: string
  users: { [k: string]: RoomUserView }
  created: number // timestamp
}

export interface RoomUserView {
  id: string // this is socket id
  name: string
  joined: number
  publishedTracks: { [K in TrackType]: Track }
  subscribedTracks: number[]
  hasVideo: boolean
  hasAudio: boolean
  hasScreenshare: boolean
}

export interface JoinResponse {
  userId: string
  roomState: RoomStateView
}

export interface RoomUser {
  id: string // this is socket id
  name: string
  joined: number
  publishedTracks: Map<TrackType, Track>
  subscribedTracks: number[]
  hasVideo: boolean
  hasAudio: boolean
  hasScreenshare: boolean
}

export type TrackType = 'video' | 'audio' | 'chat'

export interface Track {
  kind: TrackType
  alias: number // TODO: why not bigint
  announced: number // timestamp
  published: number // timestamp
}

export interface JoinRequest {
  roomName: string
  username: string
}

export interface UpdateTrackRequest {
  trackType: TrackType
  event: 'publish' | 'announce'
}

export interface ErrorResponse {
  category: string
  code: number
  text: string
}

export interface TrackUpdateResponse {
  userId: string
  track: Track
}

export interface UserDisconnectedMessage {
  userId: string
}

export interface RoomTimeoutMessage {
  message: string
}

export interface ToggleRequest {
  kind: 'cam' | 'mic' | 'screenshare'
  value: boolean
}

export interface ToggleResponse {
  userId: string
  kind: 'cam' | 'mic' | 'screenshare'
  value: boolean
}

export enum ErrorCode {
  MaxUserReached = 100,
  MaxRoomReached = 101,
  RoomNotFound = 102,
  UserNotFound = 103,
  InvalidUsername = 104,
  InvalidRoomName = 105,
  RoomTimeout = 106,
  InvalidRequest = 107,
}
