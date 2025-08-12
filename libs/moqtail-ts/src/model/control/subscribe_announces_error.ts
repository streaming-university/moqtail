import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { ReasonPhrase } from '../common/reason_phrase'
import { ControlMessageType, SubscribeAnnouncesErrorCode } from './constant'
import { LengthExceedsMaxError } from '../error/error'

export class SubscribeAnnouncesError {
  constructor(
    public readonly requestId: bigint,
    public readonly errorCode: SubscribeAnnouncesErrorCode,
    public readonly reasonPhrase: ReasonPhrase,
  ) {}

  getType(): ControlMessageType {
    return ControlMessageType.SubscribeAnnouncesError
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.SubscribeAnnouncesError)
    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    payload.putVI(this.errorCode)
    payload.putReasonPhrase(this.reasonPhrase)
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('SubscribeAnnouncesError::serialize(payload_length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): SubscribeAnnouncesError {
    const requestId = buf.getVI()
    const errorCodeRaw = buf.getVI()
    const errorCode = SubscribeAnnouncesErrorCode.tryFrom(errorCodeRaw)
    const reasonPhrase = buf.getReasonPhrase()
    return new SubscribeAnnouncesError(requestId, errorCode, reasonPhrase)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('SubscribeAnnouncesError', () => {
    test('roundtrip', () => {
      const requestId = 662607n
      const errorCode = SubscribeAnnouncesErrorCode.ExpiredAuthToken
      const reasonPhrase = new ReasonPhrase('Cheap weiners on aisle 9')
      const msg = new SubscribeAnnouncesError(requestId, errorCode, reasonPhrase)
      const frozen = msg.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.SubscribeAnnouncesError))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = SubscribeAnnouncesError.parsePayload(frozen)
      expect(deserialized.requestId).toBe(msg.requestId)
      expect(deserialized.errorCode).toBe(msg.errorCode)
      expect(deserialized.reasonPhrase.phrase).toBe(msg.reasonPhrase.phrase)
      expect(frozen.remaining).toBe(0)
    })
    test('excess roundtrip', () => {
      const requestId = 662607n
      const errorCode = SubscribeAnnouncesErrorCode.ExpiredAuthToken
      const reasonPhrase = new ReasonPhrase('Cheap weiners on aisle 9')
      const msg = new SubscribeAnnouncesError(requestId, errorCode, reasonPhrase)
      const serialized = msg.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.SubscribeAnnouncesError))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = SubscribeAnnouncesError.parsePayload(frozen)
      expect(deserialized.requestId).toBe(msg.requestId)
      expect(deserialized.errorCode).toBe(msg.errorCode)
      expect(deserialized.reasonPhrase.phrase).toBe(msg.reasonPhrase.phrase)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })
    test('partial message', () => {
      const requestId = 662607n
      const errorCode = SubscribeAnnouncesErrorCode.ExpiredAuthToken
      const reasonPhrase = new ReasonPhrase('Cheap weiners on aisle 9')
      const msg = new SubscribeAnnouncesError(requestId, errorCode, reasonPhrase)
      const serialized = msg.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        SubscribeAnnouncesError.parsePayload(frozen)
      }).toThrow()
    })
  })
}
