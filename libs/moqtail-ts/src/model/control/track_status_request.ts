import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { Tuple } from '../common/tuple'
import { KeyValuePair } from '../common/pair'
import { ControlMessageType } from './constant'
import { LengthExceedsMaxError } from '../error/error'
import { FullTrackName } from '../data'

export class TrackStatusRequest {
  constructor(
    public readonly requestId: bigint,
    public readonly fullTrackName: FullTrackName,
    public readonly parameters: KeyValuePair[],
  ) {}

  getType(): ControlMessageType {
    return ControlMessageType.TrackStatusRequest
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.TrackStatusRequest)
    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    payload.putFullTrackName(this.fullTrackName)
    payload.putVI(this.parameters.length)
    for (const param of this.parameters) {
      payload.putKeyValuePair(param)
    }
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('TrackStatusRequest::serialize(payloadBytes.length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): TrackStatusRequest {
    const requestId = buf.getVI()
    const fullTrackName = buf.getFullTrackName()
    const paramCount = buf.getNumberVI()
    const parameters: KeyValuePair[] = new Array(paramCount)
    for (let i = 0; i < paramCount; i++) {
      parameters[i] = buf.getKeyValuePair()
    }
    return new TrackStatusRequest(requestId, fullTrackName, parameters)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('TrackStatusRequest', () => {
    test('roundtrip', () => {
      const requestId = 241421n
      const trackNamespace = Tuple.fromUtf8Path('charlie/chocolate/factory')
      const trackName = new TextEncoder().encode('OompaLumpa')
      const fullTrackName = FullTrackName.tryNew(trackNamespace, trackName)
      const parameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('Chocomocco?!')),
      ]
      const msg = new TrackStatusRequest(requestId, fullTrackName, parameters)
      const frozen = msg.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.TrackStatusRequest))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = TrackStatusRequest.parsePayload(frozen)
      expect(deserialized).toEqual(msg)
      expect(frozen.remaining).toBe(0)
    })
    test('excess roundtrip', () => {
      const requestId = 241421n
      const trackNamespace = Tuple.fromUtf8Path('charlie/chocolate/factory')
      const trackName = new TextEncoder().encode('OompaLumpa')
      const fullTrackName = FullTrackName.tryNew(trackNamespace, trackName)
      const parameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('Chocomocco?!')),
      ]
      const msg = new TrackStatusRequest(requestId, fullTrackName, parameters)
      const serialized = msg.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.TrackStatusRequest))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = TrackStatusRequest.parsePayload(frozen)
      expect(deserialized).toEqual(msg)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })
    test('partial message', () => {
      const requestId = 241421n
      const trackNamespace = Tuple.fromUtf8Path('charlie/chocolate/factory')
      const trackName = new TextEncoder().encode('OompaLumpa')
      const fullTrackName = FullTrackName.tryNew(trackNamespace, trackName)
      const parameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('Chocomocco?!')),
      ]
      const msg = new TrackStatusRequest(requestId, fullTrackName, parameters)
      const serialized = msg.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        TrackStatusRequest.parsePayload(frozen)
      }).toThrow()
    })
  })
}
