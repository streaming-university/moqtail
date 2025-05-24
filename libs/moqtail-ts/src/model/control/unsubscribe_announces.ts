import { ByteBuffer, FrozenByteBuffer, BaseByteBuffer } from '../common/byte_buffer'
import { ControlMessageType } from './constant'
import { Tuple } from '../common/tuple'
import { LengthExceedsMaxError } from '../error/error'

export class UnsubscribeAnnounces {
  constructor(public readonly trackNamespacePrefix: Tuple) {}

  getType(): ControlMessageType {
    return ControlMessageType.UnsubscribeAnnounces
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.UnsubscribeAnnounces)
    const payload = new ByteBuffer()
    payload.putTuple(this.trackNamespacePrefix)
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('UnsubscribeAnnounces::serialize(payload_length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): UnsubscribeAnnounces {
    const trackNamespacePrefix = buf.getTuple()
    return new UnsubscribeAnnounces(trackNamespacePrefix)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('UnsubscribeAnnounces', () => {
    test('roundtrip', () => {
      const trackNamespacePrefix = Tuple.fromUtf8Path('un/announce/me')
      const unsubscribeAnnounces = new UnsubscribeAnnounces(trackNamespacePrefix)
      const frozen = unsubscribeAnnounces.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.UnsubscribeAnnounces))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = UnsubscribeAnnounces.parsePayload(frozen)
      expect(deserialized.trackNamespacePrefix.equals(trackNamespacePrefix)).toBe(true)
      expect(frozen.remaining).toBe(0)
    })

    test('excess roundtrip', () => {
      const trackNamespacePrefix = Tuple.fromUtf8Path('un/announce/me')
      const unsubscribeAnnounces = new UnsubscribeAnnounces(trackNamespacePrefix)
      const serialized = unsubscribeAnnounces.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer(excess.length)
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.UnsubscribeAnnounces))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = UnsubscribeAnnounces.parsePayload(frozen)
      expect(deserialized.trackNamespacePrefix).toEqual(trackNamespacePrefix)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })

    test('partial message', () => {
      const trackNamespacePrefix = Tuple.fromUtf8Path('un/announce/me')
      const unsubscribeAnnounces = new UnsubscribeAnnounces(trackNamespacePrefix)
      const serialized = unsubscribeAnnounces.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        UnsubscribeAnnounces.parsePayload(frozen)
      }).toThrow()
    })
  })
}
