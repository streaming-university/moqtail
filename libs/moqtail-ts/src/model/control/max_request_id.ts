import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { ControlMessageType } from './constant'
import { LengthExceedsMaxError } from '../error/error'

export class MaxRequestId {
  public readonly requestId: bigint

  constructor(requestId: bigint | number) {
    this.requestId = BigInt(requestId)
  }

  getType(): ControlMessageType {
    return ControlMessageType.MaxRequestId
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    buf.putVI(ControlMessageType.MaxRequestId)
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('MaxRequestId::serialize(payload_length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): MaxRequestId {
    const requestId = buf.getVI()
    return new MaxRequestId(requestId)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('MaxRequestId', () => {
    test('roundtrip', () => {
      const requestId = 12345n
      const maxRequestId = new MaxRequestId(requestId)
      const frozen = maxRequestId.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.MaxRequestId))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = MaxRequestId.parsePayload(frozen)
      expect(deserialized.requestId).toBe(maxRequestId.requestId)
      expect(frozen.remaining).toBe(0)
    })
    test('excess roundtrip', () => {
      const requestId = 67890n
      const maxRequestId = new MaxRequestId(requestId)
      const serialized = maxRequestId.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.MaxRequestId))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = MaxRequestId.parsePayload(frozen)
      expect(deserialized.requestId).toBe(maxRequestId.requestId)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })
    test('partial message', () => {
      const requestId = 112233n
      const maxRequestId = new MaxRequestId(requestId)
      const serialized = maxRequestId.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const buf = new ByteBuffer()
      buf.putBytes(partial)
      const frozen = buf.freeze()
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        MaxRequestId.parsePayload(frozen)
      }).toThrow()
    })
  })
}
