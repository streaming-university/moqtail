import { ObjectCache } from './object_cache'
import { Location } from '../../model/common/location'
import { MoqtObject } from '../../model/data/object'

export interface ContentSource {
  readonly objectCache?: ObjectCache
  readonly liveStream?: ReadableStream<MoqtObject>
  getObjectRange?(start?: Location, end?: Location): Promise<MoqtObject[]>
  onNewObject?(listener: (obj: MoqtObject) => Promise<void> | void): () => void
}

export class StaticContentSource implements ContentSource {
  readonly objectCache: ObjectCache

  constructor(objectCache: ObjectCache) {
    this.objectCache = objectCache
  }

  async getObjectRange(start?: Location, end?: Location): Promise<MoqtObject[]> {
    return this.objectCache.getRange(start, end)
  }
}

export class LiveContentSource implements ContentSource {
  readonly liveStream: ReadableStream<MoqtObject>
  readonly #listeners = new Set<(obj: MoqtObject) => void>()
  readonly #doneListeners = new Set<() => void>()

  largestLocation?: Location
  #ingestActive = false

  constructor(liveStream: ReadableStream<MoqtObject>) {
    this.liveStream = liveStream
    this.#startIngest()
  }

  async #startIngest() {
    if (this.#ingestActive) return
    this.#ingestActive = true
    const reader = this.liveStream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      this.largestLocation = value.location
      for (const listener of this.#listeners) Promise.resolve().then(() => listener(value))
    }
    this.#ingestActive = false
    for (const doneListener of this.#doneListeners) Promise.resolve().then(() => doneListener())
  }

  onNewObject(listener: (obj: MoqtObject) => void) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }
  onDone(listener: () => void): () => void {
    this.#doneListeners.add(listener)
    return () => this.#doneListeners.delete(listener)
  }
}

export class HybridContentSource implements ContentSource {
  readonly objectCache: ObjectCache
  readonly liveStream: ReadableStream<MoqtObject>
  private ingestActive = false
  private listeners = new Set<(obj: MoqtObject) => void>()

  constructor(objectCache: ObjectCache, liveStream: ReadableStream<MoqtObject>) {
    this.objectCache = objectCache
    this.liveStream = liveStream
    this._startIngest()
  }

  private async _startIngest() {
    if (this.ingestActive) return
    this.ingestActive = true
    const reader = this.liveStream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      this.objectCache.add(value)
      for (const listener of this.listeners) Promise.resolve(listener(value))
    }
    this.ingestActive = false
  }

  async getObjectRange(start?: Location, end?: Location): Promise<MoqtObject[]> {
    return this.objectCache.getRange(start, end)
  }

  onNewObject(listener: (obj: MoqtObject) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
