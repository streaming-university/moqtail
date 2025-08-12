import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { ReasonPhrase } from '../common/reason_phrase'
import { ControlMessageType, FetchErrorCode } from './constant'
import { LengthExceedsMaxError } from '../error/error'

export class FetchError {
  public readonly requestId: bigint
  public readonly errorCode: FetchErrorCode
  public readonly reasonPhrase: ReasonPhrase

  constructor(requestId: bigint, errorCode: FetchErrorCode, reasonPhrase: ReasonPhrase) {
    this.requestId = requestId
    this.errorCode = errorCode
    this.reasonPhrase = reasonPhrase
  }
  getType(): ControlMessageType {
    return ControlMessageType.FetchError
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.FetchError)
    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    payload.putVI(this.errorCode)
    payload.putReasonPhrase(this.reasonPhrase)
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('FetchError::serialize(payloadBytes.length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): FetchError {
    const requestId = buf.getVI()
    const errorCodeRaw = buf.getVI()
    const errorCode = FetchErrorCode.tryFrom(errorCodeRaw)
    const reasonPhrase = buf.getReasonPhrase()
    return new FetchError(requestId, errorCode, reasonPhrase)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('FetchError', () => {
    test('roundtrip', () => {
      const requestId = 271828n
      const errorCode = FetchErrorCode.Timeout
      const reasonPhrase = new ReasonPhrase("It's not you, it's me.")
      const fetchError = new FetchError(requestId, errorCode, reasonPhrase)
      const frozen = fetchError.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.FetchError))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = FetchError.parsePayload(frozen)
      expect(deserialized.requestId).toBe(fetchError.requestId)
      expect(deserialized.errorCode).toBe(fetchError.errorCode)
      expect(deserialized.reasonPhrase.phrase).toBe(fetchError.reasonPhrase.phrase)
      expect(frozen.remaining).toBe(0)
    })

    test('excess roundtrip', () => {
      const requestId = 271828n
      const errorCode = FetchErrorCode.Timeout
      const reasonPhrase = new ReasonPhrase("It's not you, it's me.")
      const fetchError = new FetchError(requestId, errorCode, reasonPhrase)
      const serialized = fetchError.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.FetchError))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = FetchError.parsePayload(frozen)
      expect(deserialized.requestId).toBe(fetchError.requestId)
      expect(deserialized.errorCode).toBe(fetchError.errorCode)
      expect(deserialized.reasonPhrase.phrase).toBe(fetchError.reasonPhrase.phrase)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })

    test('partial message', () => {
      const requestId = 271828n
      const errorCode = FetchErrorCode.Timeout
      const reasonPhrase = new ReasonPhrase("It's not you, it's me.")
      const fetchError = new FetchError(requestId, errorCode, reasonPhrase)
      const serialized = fetchError.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const buf = new ByteBuffer()
      buf.putBytes(partial)
      const frozen = buf.freeze()
      expect(() => {
        buf.getVI()
        buf.getU16()
        FetchError.parsePayload(frozen)
      }).toThrow()
    })
  })
}
