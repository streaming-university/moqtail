import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { Tuple } from '../common/tuple'
import { KeyValuePair } from '../common/pair'
import { ControlMessageType } from './constant'
import { NotEnoughBytesError, LengthExceedsMaxError } from '../error/error'

export class Announce {
  constructor(
    public readonly requestId: bigint,
    public readonly trackNamespace: Tuple,
    public readonly parameters: KeyValuePair[],
  ) {}

  getType(): ControlMessageType {
    return ControlMessageType.Announce
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.Announce)

    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    payload.putTuple(this.trackNamespace)
    payload.putVI(this.parameters.length)
    for (const param of this.parameters) {
      payload.putKeyValuePair(param)
    }
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('Announce::serialize(payloadBytes.length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): Announce {
    const requestId = buf.getVI()
    const trackNamespace = buf.getTuple()
    const paramCount = buf.getNumberVI()
    const parameters: KeyValuePair[] = new Array(paramCount)
    for (let i = 0; i < paramCount; i++) {
      parameters[i] = buf.getKeyValuePair()
    }
    return new Announce(requestId, trackNamespace, parameters)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('Announce', () => {
    test('roundtrip', () => {
      const requestId = 12345n
      const trackNamespace = Tuple.fromUtf8Path('god/dayyum')
      const parameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('wololoo')),
      ]
      const announce = new Announce(requestId, trackNamespace, parameters)
      const serialized = announce.serialize()
      const buf = new ByteBuffer()
      buf.putBytes(serialized.toUint8Array())
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.Announce))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = Announce.parsePayload(frozen)
      expect(deserialized.requestId).toBe(announce.requestId)
      expect(deserialized.trackNamespace.equals(announce.trackNamespace)).toBe(true)
      expect(deserialized.parameters.length).toBe(announce.parameters.length)
      for (let i = 0; i < deserialized.parameters.length; i++) {
        expect(deserialized.parameters[i]).toEqual(announce.parameters[i])
      }
      expect(frozen.remaining).toBe(0)
    })
    test('excess roundtrip', () => {
      const requestId = 12345n
      const trackNamespace = Tuple.fromUtf8Path('god/dayyum')
      const parameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('wololoo')),
      ]
      const announce = new Announce(requestId, trackNamespace, parameters)
      const serialized = announce.serialize().toUint8Array()
      const excess = new Uint8Array(serialized.length + 3)
      excess.set(serialized)
      excess.set([9, 1, 1], serialized.length)
      const buf = new ByteBuffer()
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.Announce))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = Announce.parsePayload(frozen)
      expect(deserialized.requestId).toBe(announce.requestId)
      expect(deserialized.trackNamespace.equals(announce.trackNamespace)).toBe(true)
      expect(deserialized.parameters.length).toBe(announce.parameters.length)
      for (let i = 0; i < deserialized.parameters.length; i++) {
        expect(deserialized.parameters[i]).toEqual(announce.parameters[i])
      }
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })
    test('partial message', () => {
      const requestId = 12345n
      const trackNamespace = Tuple.fromUtf8Path('god/dayyum')
      const parameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('wololoo')),
      ]
      const announce = new Announce(requestId, trackNamespace, parameters)
      const serialized = announce.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const buf = new ByteBuffer()
      buf.putBytes(partial)
      const frozen = buf.freeze()
      let threw = false
      try {
        frozen.getVI()
        frozen.getU16()
        Announce.parsePayload(frozen)
      } catch (e) {
        threw = true
        expect(e).toBeInstanceOf(NotEnoughBytesError)
      }
      expect(threw).toBe(true)
    })
  })
}
