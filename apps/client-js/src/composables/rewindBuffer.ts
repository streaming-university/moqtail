import { MoqtObject } from 'moqtail-ts/model'
import { PullPlayoutBuffer } from 'moqtail-ts/util'

export interface BufferedMoqtObject {
  object: MoqtObject
  timestamp: number
  type: 'video' | 'audio'
}

export class RewindBuffer {
  private buffer: BufferedMoqtObject[] = []
  private readonly maxDurationMs: number

  constructor(maxDurationMs: number = 30000) {
    this.maxDurationMs = maxDurationMs
    // No maxItems limit - keep all objects within the time window
  }

  addObject(object: MoqtObject, type: 'video' | 'audio'): void {
    const timestamp = Date.now()

    try {
      // Clone the object to avoid issues with transferred ArrayBuffers
      const clonedPayload = object.payload ? new Uint8Array(object.payload) : null

      // Deep clone extension headers to avoid reference issues, handling BigInt values
      let clonedExtensionHeaders: any[] = []
      if (object.extensionHeaders && Array.isArray(object.extensionHeaders)) {
        clonedExtensionHeaders = object.extensionHeaders.map((header) => {
          if (header && typeof header === 'object') {
            // Create a deep copy of the header, handling BigInt values
            return this.cloneObjectWithBigInt(header)
          }
          return header
        })
      }

      const clonedObject = clonedPayload
        ? MoqtObject.newWithPayload(
            object.fullTrackName,
            object.location,
            object.publisherPriority,
            object.objectForwardingPreference,
            object.subgroupId,
            clonedExtensionHeaders, // Use the cloned headers
            clonedPayload,
          )
        : object

      this.buffer.push({
        object: clonedObject,
        timestamp,
        type,
      })

      console.log(`RewindBuffer: Added ${type} object`, {
        trackName: object.fullTrackName,
        group: object.location.group.toString(),
        objectId: object.location.object.toString(),
        payloadSize: object.payload?.length || 0,
        extensionHeadersCount: object.extensionHeaders?.length || 0,
        bufferSize: this.buffer.length,
      })

      // Clean up old objects
      // Clean up old objects
      this.cleanup(timestamp)
    } catch (error) {
      console.error('Error adding object to rewind buffer:', error, {
        type,
        trackName: object.fullTrackName,
        payloadSize: object.payload?.length || 0,
      })
      return
    }
  }

  // Helper method to clone objects containing BigInt values
  private cloneObjectWithBigInt(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    if (typeof obj === 'bigint') {
      return obj // BigInt values are immutable, so we can return them directly
    }

    if (obj instanceof Array) {
      return obj.map((item) => this.cloneObjectWithBigInt(item))
    }

    const cloned: any = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key]
        if (typeof value === 'bigint') {
          cloned[key] = value // BigInt values are immutable
        } else if (typeof value === 'object' && value !== null) {
          cloned[key] = this.cloneObjectWithBigInt(value)
        } else {
          cloned[key] = value
        }
      }
    }
    return cloned
  }

  private cleanup(currentTimestamp: number): void {
    const cutoffTime = currentTimestamp - this.maxDurationMs

    // Remove objects older than maxDurationMs - keep all objects within the 30-second rolling window
    const beforeCount = this.buffer.length
    this.buffer = this.buffer.filter((item) => item.timestamp >= cutoffTime)
    const afterCount = this.buffer.length

    if (beforeCount !== afterCount) {
      console.log(
        `RewindBuffer: Cleaned up ${beforeCount - afterCount} old objects, keeping ${afterCount} objects in buffer`,
      )
    }
  }

  getObjects(type?: 'video' | 'audio'): BufferedMoqtObject[] {
    if (type) {
      return this.buffer.filter((item) => item.type === type)
    }
    return [...this.buffer]
  }

  getVideoObjects(): BufferedMoqtObject[] {
    return this.getObjects('video')
  }

  getAudioObjects(): BufferedMoqtObject[] {
    return this.getObjects('audio')
  }

  clear(): void {
    this.buffer = []
  }

  getDurationMs(): number {
    if (this.buffer.length === 0) return 0
    const oldest = this.buffer[0].timestamp
    const newest = this.buffer[this.buffer.length - 1].timestamp
    return newest - oldest
  }

  getCount(): number {
    return this.buffer.length
  }

  // Create a ReadableStream for video objects to be used with PullPlayoutBuffer
  createVideoStream(): ReadableStream<MoqtObject> {
    // Sort video objects by MOQ location (group, then object) for proper playback order
    const videoObjects = this.getVideoObjects().sort((a, b) => a.object.location.compare(b.object.location))
    let index = 0

    console.log(`RewindBuffer: Creating video stream with ${videoObjects.length} objects`)
    if (videoObjects.length > 0) {
      console.log('RewindBuffer: Video stream range:', {
        firstGroup: videoObjects[0].object.location.group.toString(),
        firstObject: videoObjects[0].object.location.object.toString(),
        lastGroup: videoObjects[videoObjects.length - 1].object.location.group.toString(),
        lastObject: videoObjects[videoObjects.length - 1].object.location.object.toString(),
      })
    }

    return new ReadableStream<MoqtObject>({
      pull(controller) {
        if (index >= videoObjects.length) {
          console.log('RewindBuffer: Video stream completed, all objects delivered')
          controller.close()
          return
        }

        const obj = videoObjects[index].object
        console.log(
          `RewindBuffer: Delivering video object ${index + 1}/${videoObjects.length} - Group: ${obj.location.group.toString()}, Object: ${obj.location.object.toString()}`,
        )
        controller.enqueue(obj)
        index++
      },
    })
  }

  // Create a ReadableStream for audio objects to be used with PullPlayoutBuffer
  createAudioStream(): ReadableStream<MoqtObject> {
    // Sort audio objects by MOQ location (group, then object) for proper playback order
    const audioObjects = this.getAudioObjects().sort((a, b) => a.object.location.compare(b.object.location))
    let index = 0

    console.log(`RewindBuffer: Creating audio stream with ${audioObjects.length} objects`)
    if (audioObjects.length > 0) {
      console.log('RewindBuffer: Audio stream range:', {
        firstGroup: audioObjects[0].object.location.group.toString(),
        firstObject: audioObjects[0].object.location.object.toString(),
        lastGroup: audioObjects[audioObjects.length - 1].object.location.group.toString(),
        lastObject: audioObjects[audioObjects.length - 1].object.location.object.toString(),
      })
    }

    return new ReadableStream<MoqtObject>({
      pull(controller) {
        if (index >= audioObjects.length) {
          console.log('RewindBuffer: Audio stream completed, all objects delivered')
          controller.close()
          return
        }

        const obj = audioObjects[index].object
        console.log(
          `RewindBuffer: Delivering audio object ${index + 1}/${audioObjects.length} - Group: ${obj.location.group.toString()}, Object: ${obj.location.object.toString()}`,
        )
        controller.enqueue(obj)
        index++
      },
    })
  }

  // Create a combined stream for both video and audio, sorted by MOQ location
  createCombinedStream(): ReadableStream<MoqtObject> {
    const allObjects = [...this.buffer].sort((a, b) => a.object.location.compare(b.object.location))
    let index = 0

    return new ReadableStream<MoqtObject>({
      pull(controller) {
        if (index >= allObjects.length) {
          controller.close()
          return
        }

        controller.enqueue(allObjects[index].object)
        index++
      },
    })
  }

  // Create PullPlayoutBuffer instances for video and audio
  createVideoPlayoutBuffer(): PullPlayoutBuffer {
    const videoStream = this.createVideoStream()
    return new PullPlayoutBuffer(videoStream, {
      bucketCapacity: 1000, // Much larger capacity for 30 seconds of video (~30fps = 900 frames)
      targetLatencyMs: 33, // ~30fps for video
      maxLatencyMs: 50000, // Allow for longer buffering
    })
  }

  createAudioPlayoutBuffer(): PullPlayoutBuffer {
    const audioStream = this.createAudioStream()
    return new PullPlayoutBuffer(audioStream, {
      bucketCapacity: 1500, // Audio has more frequent packets, need larger buffer
      targetLatencyMs: 20, // Lower latency for audio
      maxLatencyMs: 50000,
    })
  }

  // Create a single combined playout buffer for synchronized playback
  createCombinedPlayoutBuffer(): PullPlayoutBuffer {
    const combinedStream = this.createCombinedStream()
    return new PullPlayoutBuffer(combinedStream, {
      bucketCapacity: 2500, // Combined buffer needs to handle both video and audio
      targetLatencyMs: 33, // ~30fps
      maxLatencyMs: 50000,
    })
  }
}
