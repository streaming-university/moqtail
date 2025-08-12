import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { ReasonPhrase } from '../common/reason_phrase'
import { LengthExceedsMaxError } from '../error/error'
import { ControlMessageType, SubscribeDoneStatusCode } from './constant'

export class SubscribeDone {
  constructor(
    public readonly requestId: bigint,
    public readonly statusCode: SubscribeDoneStatusCode,
    public readonly streamCount: bigint,
    public readonly errorReason: ReasonPhrase,
  ) {}

  static new(
    requestId: bigint | number,
    statusCode: SubscribeDoneStatusCode,
    streamCount: bigint,
    errorReason: ReasonPhrase,
  ): SubscribeDone {
    return new SubscribeDone(BigInt(requestId), statusCode, streamCount, errorReason)
  }

  getType(): ControlMessageType {
    return ControlMessageType.SubscribeDone
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.SubscribeDone)
    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    payload.putVI(this.statusCode)
    payload.putVI(this.streamCount)
    payload.putReasonPhrase(this.errorReason)
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('SubscribeDone::serialize(payloadBytes.length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): SubscribeDone {
    const requestId = buf.getVI()
    const statusCodeRaw = buf.getVI()
    const statusCode = SubscribeDoneStatusCode.tryFrom(statusCodeRaw)
    const streamCount = buf.getVI()
    const errorReason = buf.getReasonPhrase()
    return new SubscribeDone(requestId, statusCode, streamCount, errorReason)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest

  describe('SubscribeDone', () => {
    test('roundtrip', () => {
      const requestId = 12345n
      const statusCode = SubscribeDoneStatusCode.SubscriptionEnded
      const streamCount = 123n
      const errorReason = new ReasonPhrase('Lorem ipsum dolor sit amet')
      const subscribeDone = SubscribeDone.new(requestId, statusCode, streamCount, errorReason)

      const frozen = subscribeDone.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.SubscribeDone))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = SubscribeDone.parsePayload(frozen)
      expect(deserialized.requestId).toBe(subscribeDone.requestId)
      expect(deserialized.statusCode).toBe(subscribeDone.statusCode)
      expect(deserialized.streamCount).toBe(subscribeDone.streamCount)
      expect(deserialized.errorReason.phrase).toBe(subscribeDone.errorReason.phrase)
      expect(frozen.remaining).toBe(0)
    })

    test('excess roundtrip', () => {
      const requestId = 12345n
      const statusCode = SubscribeDoneStatusCode.Expired
      const streamCount = 123n
      const errorReason = new ReasonPhrase('Lorem ipsum dolor sit amet')
      const subscribeDone = SubscribeDone.new(requestId, statusCode, streamCount, errorReason)
      const serialized = subscribeDone.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.SubscribeDone))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = SubscribeDone.parsePayload(frozen)
      expect(deserialized.requestId).toBe(subscribeDone.requestId)
      expect(deserialized.statusCode).toBe(subscribeDone.statusCode)
      expect(deserialized.streamCount).toBe(subscribeDone.streamCount)
      expect(deserialized.errorReason.phrase).toBe(subscribeDone.errorReason.phrase)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })

    test('partial message', () => {
      const requestId = 12345n
      const statusCode = SubscribeDoneStatusCode.Expired
      const streamCount = 123n
      const errorReason = new ReasonPhrase('Lorem ipsum dolor sit amet')
      const subscribeDone = SubscribeDone.new(requestId, statusCode, streamCount, errorReason)
      const serialized = subscribeDone.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        SubscribeDone.parsePayload(frozen)
      }).toThrow()
    })
  })
}
