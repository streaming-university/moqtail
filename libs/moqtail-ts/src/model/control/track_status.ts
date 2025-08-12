import { ByteBuffer, FrozenByteBuffer, BaseByteBuffer } from '../common/byte_buffer'
import { Location } from '../common/location'
import { KeyValuePair } from '../common/pair'
import { ControlMessageType, TrackStatusCode } from './constant'
import { LengthExceedsMaxError, ProtocolViolationError } from '../error/error'

export class TrackStatus {
  constructor(
    public readonly requestId: bigint,
    public readonly statusCode: TrackStatusCode,
    public readonly largestLocation: Location,
    public readonly parameters: KeyValuePair[],
  ) {}

  getType(): ControlMessageType {
    return ControlMessageType.TrackStatus
  }
  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.TrackStatus)
    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    payload.putVI(this.statusCode)
    switch (this.statusCode) {
      case TrackStatusCode.InProgress:
      case TrackStatusCode.Finished:
      case TrackStatusCode.RelayUnavailable:
        payload.putLocation(this.largestLocation)
        break
      case TrackStatusCode.DoesNotExist:
      case TrackStatusCode.NotYetBegun:
        // TODO: Why put zeroed location. Make this optional upon status code
        payload.putLocation(new Location(0n, 0n))
        break
    }
    payload.putVI(this.parameters.length)
    for (const param of this.parameters) {
      payload.putKeyValuePair(param)
    }
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('TrackStatus::serialize(payloadBytes.length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): TrackStatus {
    const requestId = buf.getVI()
    const statusCodeRaw = buf.getVI()
    const statusCode = TrackStatusCode.tryFrom(statusCodeRaw)
    let largestLocation = buf.getLocation()
    if (
      (statusCode === TrackStatusCode.DoesNotExist || statusCode === TrackStatusCode.NotYetBegun) &&
      !largestLocation.equals(new Location(0n, 0n))
    ) {
      throw new ProtocolViolationError('TrackStatus.parsePayload', 'Location must be 0')
    }
    const paramCount = buf.getNumberVI()
    const parameters: KeyValuePair[] = new Array(paramCount)
    for (let i = 0; i < paramCount; i++) {
      parameters[i] = buf.getKeyValuePair()
    }
    return new TrackStatus(requestId, statusCode, largestLocation, parameters)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('TrackStatus', () => {
    test('roundtrip', () => {
      const requestId = 241421n
      const statusCode = TrackStatusCode.Finished
      const largestLocation = new Location(1n, 1n)
      const parameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('Finito?!')),
      ]
      const msg = new TrackStatus(requestId, statusCode, largestLocation, parameters)
      const frozen = msg.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.TrackStatus))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = TrackStatus.parsePayload(frozen)
      expect(deserialized.requestId).toBe(requestId)
      expect(deserialized.statusCode).toBe(statusCode)
      expect(deserialized.largestLocation).toEqual(largestLocation)
      expect(deserialized.parameters).toEqual(parameters)
      expect(frozen.remaining).toBe(0)
    })

    test('excess roundtrip', () => {
      const requestId = 241421n
      const statusCode = TrackStatusCode.Finished
      const largestLocation = new Location(1n, 1n)
      const parameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('Finito?!')),
      ]
      const msg = new TrackStatus(requestId, statusCode, largestLocation, parameters)
      const serialized = msg.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.TrackStatus))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = TrackStatus.parsePayload(frozen)
      expect(deserialized.requestId).toBe(requestId)
      expect(deserialized.statusCode).toBe(statusCode)
      expect(deserialized.largestLocation).toEqual(largestLocation)
      expect(deserialized.parameters).toEqual(parameters)
      expect(frozen.remaining).toBe(3)
    })

    test('partial message', () => {
      const requestId = 241421n
      const statusCode = TrackStatusCode.Finished
      const largestLocation = new Location(1n, 1n)
      const parameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('Finito?!')),
      ]
      const msg = new TrackStatus(requestId, statusCode, largestLocation, parameters)
      const serialized = msg.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        TrackStatus.parsePayload(frozen)
      }).toThrow()
    })
  })
}
