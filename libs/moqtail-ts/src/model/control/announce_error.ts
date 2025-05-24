import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { ReasonPhrase } from '../common/reason_phrase'
import { LengthExceedsMaxError } from '../error/error'
import { AnnounceErrorCode, ControlMessageType, announceErrorCodeFromBigInt } from './constant'

export class AnnounceError {
  constructor(
    public readonly requestId: bigint,
    public readonly errorCode: AnnounceErrorCode,
    public readonly reasonPhrase: ReasonPhrase,
  ) {}

  getType(): ControlMessageType {
    return ControlMessageType.AnnounceError
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.AnnounceError)
    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    payload.putVI(this.errorCode)
    payload.putReasonPhrase(this.reasonPhrase)
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('AnnounceError::serialize(payloadBytes.length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): AnnounceError {
    const requestId = buf.getVI()
    const errorCodeRaw = buf.getVI()
    const errorCode = announceErrorCodeFromBigInt(errorCodeRaw)
    const reasonPhrase = buf.getReasonPhrase()
    return new AnnounceError(requestId, errorCode, reasonPhrase)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest

  describe('AnnounceError', () => {
    test('roundtrip', () => {
      const requestId = 12345n
      const errorCode = AnnounceErrorCode.ExpiredAuthToken
      const reasonPhrase = new ReasonPhrase('tis I sir lancelot of camelot')
      const announceError = new AnnounceError(requestId, errorCode, reasonPhrase)
      const serialized = announceError.serialize().toUint8Array()
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.AnnounceError))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = AnnounceError.parsePayload(frozen)
      expect(deserialized.requestId).toBe(announceError.requestId)
      expect(deserialized.errorCode).toBe(announceError.errorCode)
      expect(deserialized.reasonPhrase.phrase).toBe(announceError.reasonPhrase.phrase)
      expect(frozen.remaining).toBe(0)
    })

    test('excess roundtrip', () => {
      const requestId = 67890n
      const errorCode = AnnounceErrorCode.InternalError
      const reasonPhrase = new ReasonPhrase('wake me up')
      const announceError = new AnnounceError(requestId, errorCode, reasonPhrase)
      const serialized = announceError.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.AnnounceError))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = AnnounceError.parsePayload(frozen)
      expect(deserialized.requestId).toBe(announceError.requestId)
      expect(deserialized.errorCode).toBe(announceError.errorCode)
      expect(deserialized.reasonPhrase.phrase).toBe(announceError.reasonPhrase.phrase)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })

    test('partial message', () => {
      const requestId = 112233n
      const errorCode = AnnounceErrorCode.MalformedAuthToken
      const reasonPhrase = new ReasonPhrase('Uvuvwevwevwe')
      const announceError = new AnnounceError(requestId, errorCode, reasonPhrase)
      const serialized = announceError.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        AnnounceError.parsePayload(frozen)
      }).toThrow()
    })
  })
}
