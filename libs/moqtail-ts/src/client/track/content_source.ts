import { ObjectCache } from './object_cache'
import { Location } from '../../model/common/location'
import { MoqtObject } from '../../model/data/object'

// TODO: Consider switching to readbable stream
export interface PastObjectSource {
  readonly cache: ObjectCache
  getRange(start?: Location, end?: Location): Promise<MoqtObject[]>
}

export interface LiveObjectSource {
  readonly stream: ReadableStream<MoqtObject>
  readonly largestLocation: Location | undefined
  onNewObject(listener: (obj: MoqtObject) => void): () => void
  onDone(listener: () => void): () => void
  stop(): void
}

export interface TrackSource {
  readonly past?: PastObjectSource
  readonly live?: LiveObjectSource
}

export class StaticTrackSource implements PastObjectSource {
  readonly cache: ObjectCache

  constructor(cache: ObjectCache) {
    this.cache = cache
  }

  async getRange(start?: Location, end?: Location): Promise<MoqtObject[]> {
    return this.cache.getRange(start, end)
  }
}

export class LiveTrackSource implements LiveObjectSource {
  readonly stream: ReadableStream<MoqtObject>
  readonly #listeners = new Set<(obj: MoqtObject) => void>()
  readonly #doneListeners = new Set<() => void>()

  #largestLocation: Location | undefined
  #ingestActive = false
  #reader?: ReadableStreamDefaultReader<MoqtObject>

  constructor(stream: ReadableStream<MoqtObject>) {
    this.stream = stream
    this.#startIngest()
  }

  get largestLocation(): Location | undefined {
    return this.#largestLocation
  }

  async #startIngest() {
    if (this.#ingestActive) return
    this.#ingestActive = true

    try {
      this.#reader = this.stream.getReader()

      while (this.#ingestActive) {
        const { value, done } = await this.#reader.read()
        if (done) break

        this.#largestLocation = value.location

        for (const listener of this.#listeners) {
          Promise.resolve().then(() => listener(value))
        }
      }
    } catch (error) {
      console.error('Error during live object ingestion:', error)
    } finally {
      this.#ingestActive = false
      this.#reader?.releaseLock()

      for (const doneListener of this.#doneListeners) {
        Promise.resolve().then(() => doneListener())
      }
    }
  }

  onNewObject(listener: (obj: MoqtObject) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  onDone(listener: () => void): () => void {
    this.#doneListeners.add(listener)
    return () => this.#doneListeners.delete(listener)
  }

  stop(): void {
    this.#ingestActive = false
    this.#reader?.cancel()
  }
}

export class HybridTrackSource implements TrackSource {
  readonly past: PastObjectSource
  readonly live: LiveObjectSource

  constructor(cache: ObjectCache, stream: ReadableStream<MoqtObject>) {
    this.past = new StaticTrackSource(cache)
    this.live = new LiveTrackSource(stream)
  }
}
