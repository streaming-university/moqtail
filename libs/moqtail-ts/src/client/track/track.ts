import { FullTrackName, ObjectForwardingPreference } from '@/model'
import { TrackSource } from './content_source'

export type Track = {
  fullTrackName: FullTrackName
  forwardingPreference: ObjectForwardingPreference
  trackSource: TrackSource
  publisherPriority: number // 0 is highest, 255 is lowest. Values are rounded to nearest integer then clamped between 0 and 255
  trackAlias?: bigint
}
