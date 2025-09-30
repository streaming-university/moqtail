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

import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { Tuple } from '../common/tuple'
import { ControlMessageType } from './constant'
import { LengthExceedsMaxError } from '../error/error'

/**
 * @public
 * Represents a protocol Unannounce message, used to unannounce a track namespace.
 */
export class Unannounce {
  /**
   * Constructs an Unannounce message.
   * @param trackNamespace - The track namespace to unannounce.
   */
  constructor(public readonly trackNamespace: Tuple) {}

  /**
   * Gets the control message type for this Unannounce message.
   * @returns The ControlMessageType.Unannounce enum value.
   */
  getType(): ControlMessageType {
    return ControlMessageType.Unannounce
  }

  /**
   * Serializes the Unannounce message to a frozen byte buffer.
   * @returns The serialized message as a FrozenByteBuffer.
   * @throws :{@link LengthExceedsMaxError} If the payload exceeds 65535 bytes.
   */
  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.Unannounce)
    const payload = new ByteBuffer()
    payload.putTuple(this.trackNamespace)
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('Unannounce::serialize(payloadBytes.length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  /**
   * Parses an Unannounce message payload from a buffer.
   * @param buf - The buffer containing the payload.
   * @returns The parsed Unannounce message.
   */
  static parsePayload(buf: BaseByteBuffer): Unannounce {
    const trackNamespace = buf.getTuple()
    return new Unannounce(trackNamespace)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('Unannounce', () => {
    test('roundtrip', () => {
      const trackNamespace = Tuple.fromUtf8Path('un/announce/me')
      const msg = new Unannounce(trackNamespace)
      const frozen = msg.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.Unannounce))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = Unannounce.parsePayload(frozen)
      expect(deserialized.trackNamespace.equals(msg.trackNamespace)).toBe(true)
      expect(frozen.remaining).toBe(0)
    })
    test('excess roundtrip', () => {
      const trackNamespace = Tuple.fromUtf8Path('un/announce/me')
      const msg = new Unannounce(trackNamespace)
      const serialized = msg.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.Unannounce))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = Unannounce.parsePayload(frozen)
      expect(deserialized.trackNamespace.equals(msg.trackNamespace)).toBe(true)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })
    test('partial message', () => {
      const trackNamespace = Tuple.fromUtf8Path('un/announce/me')
      const msg = new Unannounce(trackNamespace)
      const serialized = msg.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const buf = new ByteBuffer()
      buf.putBytes(partial)
      const frozen = buf.freeze()
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        Unannounce.parsePayload(frozen)
      }).toThrow()
    })
  })
}
