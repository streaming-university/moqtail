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

import { ByteBuffer, FrozenByteBuffer, BaseByteBuffer } from '../common/byte_buffer'
import { ControlMessageType } from './constant'
import { LengthExceedsMaxError } from '../error/error'

export class Unsubscribe {
  public readonly requestId: bigint

  constructor(requestId: bigint | number) {
    this.requestId = BigInt(requestId)
  }

  getType(): ControlMessageType {
    return ControlMessageType.Unsubscribe
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.Unsubscribe)
    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('Unsubscribe::serialize(payloadBytes.length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): Unsubscribe {
    const requestId = buf.getVI()
    return new Unsubscribe(requestId)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest

  describe('Unsubscribe', () => {
    test('roundtrip', () => {
      const requestId = 12345n
      const msg = new Unsubscribe(requestId)
      const frozen = msg.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.Unsubscribe))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const parsed = Unsubscribe.parsePayload(frozen)
      expect(parsed.requestId).toBe(requestId)
      expect(frozen.remaining).toBe(0)
    })

    test('excess roundtrip', () => {
      const requestId = 67890n
      const msg = new Unsubscribe(requestId)
      const serialized = msg.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.Unsubscribe))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const parsed = Unsubscribe.parsePayload(frozen)
      expect(parsed.requestId).toBe(requestId)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })

    test('partial message', () => {
      const requestId = 112233n
      const msg = new Unsubscribe(requestId)
      const serialized = msg.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const buf = new FrozenByteBuffer(partial)
      expect(() => {
        buf.getVI()
        buf.getU16()
        Unsubscribe.parsePayload(buf)
      }).toThrow()
    })
  })
}
