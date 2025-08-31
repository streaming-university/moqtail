import { InvalidTypeError } from '../error'

export enum LOCHeaderExtensionId {
  CaptureTimestamp = 2,
  VideoFrameMarking = 4,
  AudioLevel = 6,
  VideoConfig = 13,
  TimestampPts = 14,
}

export function locHeaderExtensionIdFromNumber(value: number): LOCHeaderExtensionId {
  switch (value) {
    case 2:
      return LOCHeaderExtensionId.CaptureTimestamp
    case 4:
      return LOCHeaderExtensionId.VideoFrameMarking
    case 6:
      return LOCHeaderExtensionId.AudioLevel
    case 13:
      return LOCHeaderExtensionId.VideoConfig
    case 14:
      return LOCHeaderExtensionId.TimestampPts
    default:
      throw new InvalidTypeError('locHeaderExtensionIdFromNumber', `Invalid LOC header extension id: ${value}`)
  }
}
