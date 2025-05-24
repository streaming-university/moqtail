import { Location } from '../../model/common/location'
import { MoqtObject } from '../../model/data/object'

export interface ObjectCache {
  add(obj: MoqtObject): void
  getRange(start?: Location, end?: Location): MoqtObject[]
  getByLocation(location: Location): MoqtObject | undefined
  size(): number
  clear(): void
}

export class MemoryObjectCache implements ObjectCache {
  private objects: MoqtObject[] = []

  // Insert and keep sorted by Location
  add(obj: MoqtObject): void {
    const idx = this._findInsertIndex(obj)
    this.objects.splice(idx, 0, obj)
  }

  getRange(start?: Location, end?: Location): MoqtObject[] {
    const startIdx = start ? this._findIndex(start, false) : 0
    const endIdx = end ? this._findIndex(end, true) : this.objects.length
    return this.objects.slice(startIdx, endIdx)
  }

  getByLocation(location: Location): MoqtObject | undefined {
    const idx = this._findIndex(location, false)
    const obj = this.objects[idx]
    if (obj && obj.groupId === location.group && obj.objectId === location.object) {
      return obj
    }
    return undefined
  }

  size(): number {
    return this.objects.length
  }

  clear(): void {
    this.objects = []
  }

  // Binary search helpers
  private _findInsertIndex(obj: MoqtObject): number {
    let low = 0,
      high = this.objects.length
    while (low < high) {
      const mid = (low + high) >> 1
      const midObj = this.objects[mid]
      if (!midObj) break
      const cmp = new Location(midObj.groupId, midObj.objectId).compare(new Location(obj.groupId, obj.objectId))
      if (cmp < 0) low = mid + 1
      else high = mid
    }
    return low
  }

  private _findIndex(location: Location, exclusive: boolean): number {
    let low = 0,
      high = this.objects.length
    while (low < high) {
      const mid = (low + high) >> 1
      const midObj = this.objects[mid]
      if (!midObj) break
      const cmp = new Location(midObj.groupId, midObj.objectId).compare(location)
      if (cmp < 0 || (exclusive && cmp === 0)) low = mid + 1
      else high = mid
    }
    return low
  }
}

export class RingBufferObjectCache implements ObjectCache {
  private buffer: MoqtObject[]
  private maxSize: number

  constructor(maxSize: number = 100) {
    this.buffer = []
    this.maxSize = maxSize
  }

  add(obj: MoqtObject): void {
    // Insert in sorted order (by Location)
    const idx = this._findInsertIndex(obj)
    this.buffer.splice(idx, 0, obj)
    // Evict oldest if over capacity
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift()
    }
  }

  getRange(start?: Location, end?: Location): MoqtObject[] {
    const startIdx = start ? this._findIndex(start, false) : 0
    const endIdx = end ? this._findIndex(end, true) : this.buffer.length
    return this.buffer.slice(startIdx, endIdx)
  }

  getByLocation(location: Location): MoqtObject | undefined {
    const idx = this._findIndex(location, false)
    const obj = this.buffer[idx]
    if (obj && obj.groupId === location.group && obj.objectId === location.object) {
      return obj
    }
    return undefined
  }

  size(): number {
    return this.buffer.length
  }

  clear(): void {
    this.buffer = []
  }

  // Binary search helpers
  private _findInsertIndex(obj: MoqtObject): number {
    let low = 0,
      high = this.buffer.length
    while (low < high) {
      const mid = (low + high) >> 1
      const midObj = this.buffer[mid]
      if (!midObj) break
      const cmp = new Location(midObj.groupId, midObj.objectId).compare(new Location(obj.groupId, obj.objectId))
      if (cmp < 0) low = mid + 1
      else high = mid
    }
    return low
  }

  private _findIndex(location: Location, exclusive: boolean): number {
    let low = 0,
      high = this.buffer.length
    while (low < high) {
      const mid = (low + high) >> 1
      const midObj = this.buffer[mid]
      if (!midObj) break
      const cmp = new Location(midObj.groupId, midObj.objectId).compare(location)
      if (cmp < 0 || (exclusive && cmp === 0)) low = mid + 1
      else high = mid
    }
    return low
  }
}
