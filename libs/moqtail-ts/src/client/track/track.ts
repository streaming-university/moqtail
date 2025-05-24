import { FullTrackName, ObjectForwardingPreference } from '@/model'
import { ContentSource } from './content_source'

export type Track = {
  fullTrackName: FullTrackName
  trackAlias: bigint
  forwardingPreference: ObjectForwardingPreference
  contentSource: ContentSource
}
