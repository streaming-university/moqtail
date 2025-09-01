import { FullTrackName, ObjectForwardingPreference } from '@/model'
import { TrackSource } from './content_source'

/**
 * Describes a media/data track known to the client (either published locally or subscribed to).
 *
 *
 * @example Live only track
 * ```ts
 * const liveStream: ReadableStream<MoqtObject> = buildCameraStream()
 * const track: Track = {
 *   fullTrackName,
 *   forwardingPreference: ObjectForwardingPreference.Latest,
 *   trackSource: { live: liveStream },
 *   publisherPriority: 0
 * }
 * client.addOrUpdateTrack(track)
 * ```
 *
 * @example Past only track (pre‑recorded cache)
 * ```ts
 * const cache = new MemoryObjectCache()
 * recording.forEach(obj => cache.add(obj))
 * const track: Track = {
 *   fullTrackName,
 *   forwardingPreference: ObjectForwardingPreference.All,
 *   trackSource: { past: cache },
 *   publisherPriority: 64
 * }
 * client.addOrUpdateTrack(track)
 * ```
 *
 * @example Hybrid (cache + live)
 * ```ts
 * const cache = new MemoryObjectCache()
 * const liveStream = buildLiveReadableStream()
 * const track: Track = {
 *   fullTrackName,
 *   forwardingPreference: ObjectForwardingPreference.Latest,
 *   trackSource: { past: cache, live: liveStream },
 *   publisherPriority: 8
 * }
 * client.addOrUpdateTrack(track)
 * ```
 */
export type Track = {
  /**
   * Globally unique identifier for the track.
   */
  fullTrackName: FullTrackName

  /**
   * Hint controlling which objects SHOULD be forwarded / prioritized.
   */
  forwardingPreference: ObjectForwardingPreference

  /**
   * Accessors for live and/or past objects belonging to this track.
   */
  trackSource: TrackSource

  /**
   * 0 (highest) .. 255 (lowest) priority advertised with objects.
   * Values are rounded to nearest integer then clamped between 0 and 255.
   */
  publisherPriority: number

  /**
   * Optional compact numeric alias assigned during protocol negotiation.
   */
  trackAlias?: bigint
}
