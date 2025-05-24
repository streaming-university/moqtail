import { ByteBuffer, FrozenByteBuffer, BaseByteBuffer } from '../common/byte_buffer'
import { ControlMessageType } from './constant'
import { LengthExceedsMaxError } from '../error/error'

export class RequestsBlocked {
  public readonly maximumRequestId: bigint

  constructor(maximumRequestId: bigint | number) {
    this.maximumRequestId = BigInt(maximumRequestId)
  }

  getType(): ControlMessageType {
    return ControlMessageType.RequestsBlocked
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.RequestsBlocked)
    const payload = new ByteBuffer()
    payload.putVI(this.maximumRequestId)
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('RequestsBlocked::serialize', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): RequestsBlocked {
    const maximumRequestId = buf.getVI()
    return new RequestsBlocked(maximumRequestId)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('RequestsBlocked', () => {
    test('roundtrip', () => {
      const maximumRequestId = 12345n
      const requestsBlocked = new RequestsBlocked(maximumRequestId)
      const frozen = requestsBlocked.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.RequestsBlocked))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = RequestsBlocked.parsePayload(frozen)
      expect(deserialized.maximumRequestId).toBe(maximumRequestId)
      expect(frozen.remaining).toBe(0)
    })

    test('excess roundtrip', () => {
      const maximumRequestId = 12345n
      const requestsBlocked = new RequestsBlocked(maximumRequestId)
      const serialized = requestsBlocked.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.RequestsBlocked))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = RequestsBlocked.parsePayload(frozen)
      expect(deserialized.maximumRequestId).toBe(maximumRequestId)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })

    test('partial message', () => {
      const maximumRequestId = 12345n
      const requestsBlocked = new RequestsBlocked(maximumRequestId)
      const serialized = requestsBlocked.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        RequestsBlocked.parsePayload(frozen)
      }).toThrow()
    })
  })
}
