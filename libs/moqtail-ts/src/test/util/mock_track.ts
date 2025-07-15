import { Track } from '../../client/track/track'
import { LiveTrackSource, TrackSource } from '../../client/track/content_source'
import { FullTrackName, ObjectForwardingPreference } from '../../model/data'
import { MoqtObject } from '../../model/data/object'
import { Location } from '../../model/common/location'

export interface MockTrackConfig {
  fullTrackName: FullTrackName
  trackAlias: bigint
  forwardingPreference?: ObjectForwardingPreference
  productionIntervalMs?: number
  payloadSize?: number
  maxObjects?: number
  publisherPriority?: number
  gopSize?: number
}

export class MockTrack implements Track {
  public readonly fullTrackName: FullTrackName
  public readonly trackAlias: bigint
  public readonly forwardingPreference: ObjectForwardingPreference
  public readonly trackSource: TrackSource
  public readonly publisherPriority: number

  private groupId = 0n
  private objectId = 0n
  private isProducing = false
  private productionTimer?: ReturnType<typeof setInterval> | undefined
  private objectCount = 0
  private controller?: ReadableStreamDefaultController<MoqtObject>

  constructor(private config: MockTrackConfig) {
    this.fullTrackName = config.fullTrackName
    this.trackAlias = config.trackAlias
    this.forwardingPreference = config.forwardingPreference || ObjectForwardingPreference.Subgroup
    this.publisherPriority = config.publisherPriority || 128

    // Create a ReadableStream for live content
    const stream = new ReadableStream<MoqtObject>({
      start: (ctrl) => {
        this.controller = ctrl
      },
      cancel: () => {
        // Stream was cancelled, stop production
        this.stop()
      },
    })
    this.trackSource = { live: new LiveTrackSource(stream) }
  }
  private _startProduction() {
    if (this.isProducing || !this.controller) return
    this.isProducing = true

    const intervalMs = this.config.productionIntervalMs || 100
    const payloadSize = this.config.payloadSize || 64
    const maxObjects = this.config.maxObjects || 100
    const gopSize = this.config.gopSize || 10

    this.productionTimer = setInterval(() => {
      if (!this.controller) {
        this._stopProduction()
        return
      }

      if (this.objectCount >= maxObjects) {
        this.stop()
        return
      }

      // Generate mock payload with random data
      const payload = this._generateMockPayload(payloadSize, this.objectCount)

      // Create MoqtObject
      const obj = MoqtObject.newWithPayload(
        this.fullTrackName,
        new Location(this.groupId, this.objectId),
        this.publisherPriority,
        this.forwardingPreference,
        this.forwardingPreference === ObjectForwardingPreference.Subgroup ? 0n : null,
        null,
        payload,
      )

      this.controller.enqueue(obj)

      this.objectId++
      this.objectCount++

      // Advance to next group based on GOP size
      if (this.objectCount % gopSize === 0) {
        this.groupId++
        this.objectId = 0n
      }
    }, intervalMs)
  }
  private _generateMockPayload(size: number, sequenceNumber: number): Uint8Array {
    const payload = new Uint8Array(size)

    // Add sequence number at the beginning (4 bytes)
    const view = new DataView(payload.buffer)
    view.setUint32(0, sequenceNumber, false) // big-endian

    // Fill rest with random/pattern data
    for (let i = 4; i < size; i++) {
      payload[i] = Math.floor(Math.random() * 256)
    }

    return payload
  }

  private _stopProduction() {
    if (this.productionTimer) {
      clearInterval(this.productionTimer)
      this.productionTimer = undefined
    }
    this.isProducing = false
  }

  // Public control methods
  start(): void {
    this._startProduction()
  }
  stop(): void {
    this._stopProduction()

    // Close the stream
    if (this.controller) {
      try {
        this.controller.close()
      } catch {
        // Controller might already be closed
      }
    }
  }

  reset(): void {
    this.stop()
    this.groupId = 0n
    this.objectId = 0n
    this.objectCount = 0
  }

  // Getters for inspection
  get currentLocation(): Location {
    return new Location(this.groupId, this.objectId)
  }

  get isActive(): boolean {
    return this.isProducing
  }

  get objectsProduced(): number {
    return this.objectCount
  }
  // Create a new track with specific configuration
  static new(config: MockTrackConfig): MockTrack {
    return new MockTrack(config)
  } // Factory methods for common track types
  static newVideo(
    options: {
      namespace?: string
      trackName?: string
      trackAlias?: bigint
      fps?: number
      duration?: number // in seconds
      payloadSize?: number
      publisherPriority?: number
      gopSize?: number
    } = {},
  ): MockTrack {
    const {
      namespace = 'test/video',
      trackName = 'stream1',
      trackAlias = 1n,
      fps = 30,
      duration = 10,
      payloadSize = 1024,
      publisherPriority = 128,
      gopSize = 30, // Typical GOP size for video (1 second at 30fps)
    } = options

    return MockTrack.new({
      fullTrackName: FullTrackName.tryNew(namespace, trackName),
      trackAlias,
      forwardingPreference: ObjectForwardingPreference.Subgroup,
      productionIntervalMs: Math.round(1000 / fps),
      payloadSize,
      maxObjects: fps * duration,
      publisherPriority,
      gopSize,
    })
  }

  static newAudio(
    options: {
      namespace?: string
      trackName?: string
      trackAlias?: bigint
      packetsPerSecond?: number
      duration?: number // in seconds
      payloadSize?: number
      publisherPriority?: number
      gopSize?: number
    } = {},
  ): MockTrack {
    const {
      namespace = 'test/audio',
      trackName = 'stream1',
      trackAlias = 2n,
      packetsPerSecond = 50,
      duration = 10,
      payloadSize = 128,
      publisherPriority = 128,
      gopSize = 50, // 1 second worth of audio packets
    } = options

    return MockTrack.new({
      fullTrackName: FullTrackName.tryNew(namespace, trackName),
      trackAlias,
      forwardingPreference: ObjectForwardingPreference.Datagram,
      productionIntervalMs: Math.round(1000 / packetsPerSecond),
      payloadSize,
      maxObjects: packetsPerSecond * duration,
      publisherPriority,
      gopSize,
    })
  }
}
