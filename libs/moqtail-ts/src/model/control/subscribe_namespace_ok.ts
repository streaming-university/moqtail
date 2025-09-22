import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { ControlMessageType } from './constant'
import { LengthExceedsMaxError } from '../error/error'

export class SubscribeNamespaceOk {
  public readonly requestId: bigint

  constructor(requestId: bigint | number) {
    this.requestId = BigInt(requestId)
  }

  getType(): ControlMessageType {
    return ControlMessageType.SubscribeNamespaceOk
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.SubscribeNamespaceOk)
    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('SubscribeNamespaceOk::serialize(payloadBytes)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): SubscribeNamespaceOk {
    const requestId = buf.getVI()
    return new SubscribeNamespaceOk(requestId)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('SubscribeNamespaceOk', () => {
    test('roundtrip', () => {
      const requestId = 141421n
      const msg = new SubscribeNamespaceOk(requestId)
      const frozen = msg.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.SubscribeNamespaceOk))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = SubscribeNamespaceOk.parsePayload(frozen)
      expect(deserialized.requestId).toBe(msg.requestId)
      expect(frozen.remaining).toBe(0)
    })
    test('excess roundtrip', () => {
      const requestId = 141421n
      const msg = new SubscribeNamespaceOk(requestId)
      const serialized = msg.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.SubscribeNamespaceOk))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = SubscribeNamespaceOk.parsePayload(frozen)
      expect(deserialized.requestId).toBe(msg.requestId)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })
    test('partial message', () => {
      const requestId = 141421n
      const msg = new SubscribeNamespaceOk(requestId)
      const serialized = msg.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        SubscribeNamespaceOk.parsePayload(frozen)
      }).toThrow()
    })
  })
}
