/**
 * Copyright 2025 The MOQtail Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { MoqtObject } from '../model'
import Heap from 'heap-js'

const DEFAULT_BUFFER_CAPACITY = 50 // ~2 seconds at 25fps
const DEFAULT_TARGET_LATENCY_MS = 500 // Target 500ms latency
const DEFAULT_MAX_LATENCY_MS = 2000 // Drop GOPs if latency exceeds 2 seconds

export class PullPlayoutBuffer {
  #reader: ReadableStreamDefaultReader<MoqtObject>
  #buffer: Heap<MoqtObject> = new Heap((a: MoqtObject, b: MoqtObject) => {
    if (a.location.compare(b.location) <= 0) {
      if (b.location.compare(a.location) <= 0) {
        return 0
      }
      return -1
    }
    return 1
  })
  #isRunning: boolean = true
  #bucketCapacity: number
  #targetLatencyMs: number
  #maxLatencyMs: number
  #lastIncomingTimestamp: number = 0
  #pendingCallback: ((obj: MoqtObject | null) => void) | null = null

  constructor(
    writeStream: ReadableStream<MoqtObject>,
    readonly options: {
      bucketCapacity?: number // max number of objects in buffer
      targetLatencyMs?: number // target latency to maintain (default: 500ms)
      maxLatencyMs?: number // max latency before dropping GOPs (default: 2000ms)
    },
  ) {
    this.#bucketCapacity = this.options.bucketCapacity ?? DEFAULT_BUFFER_CAPACITY
    this.#targetLatencyMs = this.options.targetLatencyMs ?? DEFAULT_TARGET_LATENCY_MS
    this.#maxLatencyMs = this.options.maxLatencyMs ?? DEFAULT_MAX_LATENCY_MS
    this.#reader = writeStream.getReader()
    this.#fillBuffer()
  }

  // Pull-based API: Consumer calls this when ready for next object
  nextObject(callback: (obj: MoqtObject | null) => void): void {
    if (this.#buffer.length > 0) {
      const obj = this.#buffer.pop()
      // console.log(
      //   `📺 [PULL BUFFER] Delivering object: Group ${obj?.location.group}, Object ${obj?.location.object}, Buffer size: ${this.#buffer.length}`,
      // )
      callback(obj || null)
      return
    }

    // No object available, store callback for when one arrives
    this.#pendingCallback = callback
  }

  // Check if there's an object ready immediately (non-blocking)
  hasObjectReady(): boolean {
    return this.#buffer.length > 0
  }

  // Get current buffer status for debugging
  getStatus(): { bufferSize: number; isRunning: boolean } {
    return {
      bufferSize: this.#buffer.length,
      isRunning: this.#isRunning,
    }
  }

  // Cleanup method - called when buffer is destroyed
  cleanup(): void {
    this.#isRunning = false
  }

  // Simple background filling - just fills the buffer as objects arrive
  async #fillBuffer(): Promise<void> {
    while (this.#isRunning) {
      try {
        const { value, done } = await this.#reader.read()
        if (done) {
          this.#isRunning = false
          // Notify pending callback that stream is done
          if (this.#pendingCallback) {
            const callback = this.#pendingCallback
            this.#pendingCallback = null
            callback(null)
          }
          return
        }

        this.#lastIncomingTimestamp = performance.now()

        // If buffer is at capacity, manage overflow
        if (this.#buffer.length >= this.#bucketCapacity) {
          this.#manageBufferOverflow()
        }

        // Add the new object
        this.#buffer.push(value)

        // If there's a pending callback, fulfill it immediately
        if (this.#pendingCallback) {
          const callback = this.#pendingCallback
          this.#pendingCallback = null
          const obj = this.#buffer.pop()
          // console.log(
          //   `📺 [PULL BUFFER] Delivering object (from pending): Group ${obj?.location.group}, Object ${obj?.location.object}`,
          // )
          callback(obj || null)
        }
      } catch (error) {
        console.error('Error in fillBuffer:', error)
        this.#isRunning = false
        if (this.#pendingCallback) {
          const callback = this.#pendingCallback
          this.#pendingCallback = null
          callback(null)
        }
      }
    }
  }

  // Manage buffer overflow by dropping oldest GOPs
  #manageBufferOverflow(): void {
    const droppedGops = this.#dropMultipleGopsToTarget()
    if (droppedGops === 0) {
      // Fallback: drop 20% of oldest objects
      const dropCount = Math.floor(this.#bucketCapacity * 0.2)
      for (let i = 0; i < dropCount; i++) {
        this.#buffer.pop()
      }
      console.log(`🗑️ [PULL BUFFER] Buffer overflow: dropped ${dropCount} oldest objects (fallback)`)
    }
  }

  // Find GOP boundaries based on group IDs
  #findGopBoundaries(objects: MoqtObject[]): { start: number; end: number }[] {
    const gops: { start: number; end: number }[] = []

    if (objects.length === 0) return gops

    // Group objects by their group ID
    const groupMap = new Map<bigint, number[]>()
    objects.forEach((obj, index) => {
      const groupId = obj.location.group
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, [])
      }
      groupMap.get(groupId)!.push(index)
    })

    // Convert groups to GOP boundaries, sorted by group ID
    const sortedGroups = Array.from(groupMap.entries()).sort(([a], [b]) => {
      if (a < b) return -1
      if (a > b) return 1
      return 0
    })

    sortedGroups.forEach(([, indices]) => {
      if (indices.length > 0) {
        gops.push({
          start: Math.min(...indices),
          end: Math.max(...indices),
        })
      }
    })

    console.log(`🎬 [PULL BUFFER] Found ${gops.length} GOPs (groups) in buffer`)
    return gops
  }

  // Drop oldest GOP (complete group)
  #dropOldestGop(): boolean {
    const allObjects = this.#buffer.toArray()
    const gops = this.#findGopBoundaries(allObjects)

    if (gops.length > 0) {
      const oldestGop = gops[0]
      if (oldestGop) {
        // Get the group ID of the oldest GOP for logging
        const firstObj = allObjects[oldestGop.start]
        const groupId = firstObj?.location.group

        // Remove objects from the oldest GOP (entire group)
        for (let i = oldestGop.start; i <= oldestGop.end; i++) {
          this.#buffer.pop() // Remove from heap
        }

        console.log(`🗑️ [PULL BUFFER] Dropped GOP (Group ${groupId}): ${oldestGop.end - oldestGop.start + 1} objects`)
        return true
      }
    }
    return false
  }

  // Drop multiple GOPs to reach target buffer size
  #dropMultipleGopsToTarget(): number {
    const targetBufferSize = Math.floor(this.#bucketCapacity * 0.7) // Target 70% of capacity
    let droppedGops = 0

    while (this.#buffer.length > targetBufferSize && droppedGops < 3) {
      if (this.#dropOldestGop()) {
        droppedGops++
      } else {
        break
      }
    }

    if (droppedGops > 0) {
      console.log(
        `🗑️ [PULL BUFFER] Dropped ${droppedGops} GOPs to reduce buffer size. New buffer size: ${this.#buffer.length}`,
      )
    }

    return droppedGops
  }
}
