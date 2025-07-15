import { MoqtObject } from '../model'
import Heap from 'heap-js'
import { ClockNormalizer } from './clock_normalizer'
import { ExtensionHeaders, ExtensionHeader } from '../model/extension_header'

const DEFAULT_TARGET_LATENCY_MS = 100
const DEFAULT_MAX_LATENCY_MS = 1000

export interface BufferedObject {
  object: MoqtObject
  createdAt: number
}

/**
 * A playout buffer that manages timed delivery of MoQT objects.
 *
 * The buffer automatically extracts capture timestamps from extension headers
 * to determine when objects should be played out, maintaining consistent latency
 * and dropping old GOPs when necessary.
 *
 * Usage:
 * ```typescript
 * const buffer = new PlayoutBuffer(objectStream, {
 *   targetLatencyMs: 500,
 *   maxLatencyMs: 2000,
 *   clockNormalizer
 * });
 * buffer.onObject = (obj) => {
 *   if (obj) {
 *     // Process the object
 *   } else {
 *     // End of stream
 *   }
 * };
 * ```
 */

export class PlayoutBuffer {
  #reader: ReadableStreamDefaultReader<MoqtObject>
  #buffer: Heap<BufferedObject> = new Heap((a: BufferedObject, b: BufferedObject) => {
    return a.object.location.compare(b.object.location)
  })
  #isRunning: boolean = true
  #targetLatencyMs: number
  #maxLatencyMs: number
  #clockNormalizer: ClockNormalizer | undefined

  onObject: ((obj: MoqtObject | null) => void) | null = null

  constructor(
    objectStream: ReadableStream<MoqtObject>,
    readonly options?: {
      targetLatencyMs: number // target latency to maintain (default: 500ms)
      maxLatencyMs: number // max latency before dropping GOPs (default: 2000ms)
      clockNormalizer: ClockNormalizer
    },
  ) {
    this.#targetLatencyMs = this.options?.targetLatencyMs ?? DEFAULT_TARGET_LATENCY_MS
    this.#maxLatencyMs = this.options?.maxLatencyMs ?? DEFAULT_MAX_LATENCY_MS
    this.#clockNormalizer = this.options?.clockNormalizer
    this.#reader = objectStream.getReader()
    this.#fillBuffer()
    this.#serveBuffer()
  }

  async hasObjectReady(): Promise<boolean> {
    const now = this.#getNormalizedTime()
    const oldest = this.#buffer.peek()
    return oldest ? now - oldest.createdAt >= this.#targetLatencyMs : false
  }

  getStatus(): { bufferSize: number; isRunning: boolean; oldestTimestamp?: number } {
    const oldest = this.#buffer.peek()
    const result: { bufferSize: number; isRunning: boolean; oldestTimestamp?: number } = {
      bufferSize: this.#buffer.length,
      isRunning: this.#isRunning,
    }

    if (oldest) {
      result.oldestTimestamp = oldest.createdAt
    }

    return result
  }

  cleanup(): void {
    this.#isRunning = false
    this.onObject?.(null) // Signal end of stream
  }

  #getNormalizedTime(): number {
    if (this.#clockNormalizer) {
      return this.#clockNormalizer.now()
    }
    return Date.now()
  }

  async #serveBuffer(): Promise<void> {
    while (this.#isRunning) {
      const now = this.#getNormalizedTime()
      const oldest = this.#buffer.peek()

      if (oldest && this.onObject) {
        const timeUntilReady = this.#targetLatencyMs - (now - oldest.createdAt)

        if (timeUntilReady <= 0) {
          const bufferedObj = this.#buffer.pop()!
          this.onObject(bufferedObj.object)
        } else {
          const sleepTime = Math.min(timeUntilReady, 50)
          await new Promise((resolve) => setTimeout(resolve, sleepTime))
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }
  }

  async #fillBuffer(): Promise<void> {
    while (this.#isRunning) {
      try {
        const { value, done } = await this.#reader.read()
        if (done) {
          this.cleanup()
          return
        }
        this.#evictOnMaxLatency()

        const bufferedObject: BufferedObject = {
          object: value,
          createdAt: this.#extractCreatedAt(value),
        }

        this.#buffer.push(bufferedObject)
      } catch (error) {
        this.cleanup()
      }
    }
  }

  #extractCreatedAt(object: MoqtObject): number {
    if (object.extensionHeaders) {
      const extensionHeaders = ExtensionHeaders.fromKeyValuePairs(object.extensionHeaders)
      for (const header of extensionHeaders) {
        if (ExtensionHeader.isCaptureTimestamp(header)) {
          // Note: Assuming the timestamp is in milliseconds. If it's in a different unit,
          // this conversion might need adjustment
          return Number(header.timestamp)
        }
      }
    }

    // Fallback to current wall clock time if no capture timestamp found
    return this.#getNormalizedTime()
  }

  #evictOnMaxLatency(): void {
    const now = this.#getNormalizedTime()
    const oldest = this.#buffer.peek()
    if (oldest && now - oldest.createdAt > this.#maxLatencyMs) {
      if (oldest.object.location.object === 0n) {
        const groupToDrop = oldest.object.location.group
        this.#dropGop(groupToDrop)
      } else {
        this.#buffer.pop()
      }
      this.#evictOnMaxLatency()
    }
  }

  #dropGop(groupId: bigint): void {
    while (this.#buffer.length > 0) {
      const oldest = this.#buffer.peek()
      if (oldest && oldest.object.location.group === groupId) {
        this.#buffer.pop()
      } else {
        break
      }
    }
  }
}
