import { FullTrackName, ObjectForwardingPreference } from '@/model'
import { TrackSource } from './content_source'

/**
 * Describes a media/data track known to the client (either published locally or subscribed to).
 *
 * Fields:
 * - {@link Track.fullTrackName | fullTrackName}: Globally unique identifier for the track.
 * - {@link Track.forwardingPreference | forwardingPreference}: Hint controlling which objects SHOULD be forwarded / prioritized.
 * - {@link Track.trackSource | trackSource}: Accessors for live and/or past objects belonging to this track.
 * - {@link Track.publisherPriority | publisherPriority}: 0 (highest) .. 255 (lowest) priority advertised with objects.
 * - {@link Track.trackAlias | trackAlias}: Optional compact numeric alias assigned during protocol negotiation.
 *
 * Priority rules: Values outside [0,255] SHOULD be clamped by the caller. Lower numbers get preferential treatment
 * in congestion / scheduling scenarios.
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
  fullTrackName: FullTrackName
  forwardingPreference: ObjectForwardingPreference
  trackSource: TrackSource
  publisherPriority: number // 0 is highest, 255 is lowest. Values are rounded to nearest integer then clamped between 0 and 255
  trackAlias?: bigint
}
