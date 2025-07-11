import { ByteBuffer, FrozenByteBuffer, BaseByteBuffer } from '../common/byte_buffer'
import { FetchHeaderType } from './constant'

export class FetchHeader {
  public readonly requestId: bigint

  constructor(
    public readonly type: FetchHeaderType,
    requestId: bigint | number,
  ) {
    this.requestId = BigInt(requestId)
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(this.type)
    buf.putVI(this.requestId)
    return buf.freeze()
  }

  static deserialize(buf: BaseByteBuffer): FetchHeader {
    const typeRaw = buf.getVI()
    const type = FetchHeaderType.tryFrom(typeRaw)
    const requestId = buf.getVI()
    return new FetchHeader(type, requestId)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest

  describe('FetchHeader', () => {
    test('roundtrip serialization/deserialization', () => {
      const requestId = 144n
      const fetchHeader = new FetchHeader(FetchHeaderType.Type0x05, requestId)
      const frozen = fetchHeader.serialize()
      const parsed = FetchHeader.deserialize(frozen)
      expect(parsed.type).toEqual(FetchHeaderType.Type0x05)
      expect(parsed.requestId).toBe(fetchHeader.requestId)
      expect(frozen.remaining).toBe(0)
    })

    test('excess roundtrip', () => {
      const requestId = 144n
      const fetchHeader = new FetchHeader(FetchHeaderType.Type0x05, requestId)
      const serialized = fetchHeader.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const parsed = FetchHeader.deserialize(frozen)
      expect(parsed.type).toEqual(FetchHeaderType.Type0x05)
      expect(parsed.requestId).toBe(fetchHeader.requestId)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })

    test('partial message fails', () => {
      const requestId = 144n
      const fetchHeader = new FetchHeader(FetchHeaderType.Type0x05, requestId)
      const serialized = fetchHeader.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        FetchHeader.deserialize(frozen)
      }).toThrow()
    })
  })
}
