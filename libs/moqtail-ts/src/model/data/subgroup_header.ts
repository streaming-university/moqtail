import { ByteBuffer, FrozenByteBuffer, BaseByteBuffer } from '../common/byte_buffer'
import { ProtocolViolationError } from '../error'
import { SubgroupHeaderType } from './constant'

export class SubgroupHeader {
  public readonly trackAlias: bigint
  public readonly groupId: bigint
  public readonly subgroupId: bigint | null

  constructor(
    public readonly headerType: SubgroupHeaderType,
    trackAlias: bigint,
    groupId: bigint,
    subgroupId: bigint | number | null,
    public readonly publisherPriority: number,
  ) {
    this.trackAlias = BigInt(trackAlias)
    this.groupId = BigInt(groupId)
    if (subgroupId !== null) {
      this.subgroupId = BigInt(subgroupId)
    } else {
      this.subgroupId = subgroupId
    }
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(this.headerType)
    buf.putVI(this.trackAlias)
    buf.putVI(this.groupId)
    if (SubgroupHeaderType.hasExplicitSubgroupId(this.headerType)) {
      if (this.subgroupId === null || this.subgroupId === undefined) {
        throw new ProtocolViolationError(
          'SubgroupHeader::serialize',
          'Subgroup_id field is required for this header type',
        )
      }
      buf.putVI(this.subgroupId)
    }
    buf.putU8(this.publisherPriority)
    return buf.freeze()
  }

  static deserialize(buf: BaseByteBuffer): SubgroupHeader {
    const headerType = SubgroupHeaderType.tryFrom(buf.getNumberVI())
    const trackAlias = buf.getVI()
    const groupId = buf.getVI()
    let subgroupId: bigint | null = null
    if (SubgroupHeaderType.hasExplicitSubgroupId(headerType)) {
      subgroupId = buf.getVI()
    } else if (headerType === SubgroupHeaderType.Type0x08 || headerType === SubgroupHeaderType.Type0x09) {
      subgroupId = 0n
    } else {
      subgroupId = null
    }
    const publisherPriority = buf.getU8()
    return new SubgroupHeader(headerType, trackAlias, groupId, subgroupId, publisherPriority)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('SubgroupHeader', () => {
    test('roundtrip serialization/deserialization', () => {
      const headerType = SubgroupHeaderType.Type0x0C
      const trackAlias = 87n
      const groupId = 9n
      const subgroupId = 11n
      const publisherPriority = 255
      const header = new SubgroupHeader(headerType, trackAlias, groupId, subgroupId, publisherPriority)
      const frozen = header.serialize()
      const parsed = SubgroupHeader.deserialize(frozen)
      expect(parsed.headerType).toBe(header.headerType)
      expect(parsed.trackAlias).toBe(header.trackAlias)
      expect(parsed.groupId).toBe(header.groupId)
      expect(parsed.subgroupId).toBe(header.subgroupId)
      expect(parsed.publisherPriority).toBe(header.publisherPriority)
      expect(frozen.remaining).toBe(0)
    })
    test('excess roundtrip', () => {
      const headerType = SubgroupHeaderType.Type0x0C
      const trackAlias = 87n
      const groupId = 9n
      const subgroupId = 11n
      const publisherPriority = 255
      const header = new SubgroupHeader(headerType, trackAlias, groupId, subgroupId, publisherPriority)
      const serialized = header.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const parsed = SubgroupHeader.deserialize(frozen)
      expect(parsed.headerType).toBe(header.headerType)
      expect(parsed.trackAlias).toBe(header.trackAlias)
      expect(parsed.groupId).toBe(header.groupId)
      expect(parsed.subgroupId).toBe(header.subgroupId)
      expect(parsed.publisherPriority).toBe(header.publisherPriority)
      expect(frozen.remaining).toBe(3)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })
    test('partial message fails', () => {
      const headerType = SubgroupHeaderType.Type0x0C
      const trackAlias = 87n
      const groupId = 9n
      const subgroupId = 11n
      const publisherPriority = 255
      const header = new SubgroupHeader(headerType, trackAlias, groupId, subgroupId, publisherPriority)
      const serialized = header.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        SubgroupHeader.deserialize(frozen)
      }).toThrow()
    })
  })
}
