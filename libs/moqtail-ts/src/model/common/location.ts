import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from './byte_buffer'
import { NotEnoughBytesError } from '../error/error'

export class Location {
  public readonly group: bigint
  public readonly object: bigint
  constructor(group: bigint | number, object: bigint | number) {
    this.group = BigInt(group)
    this.object = BigInt(object)
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(this.group)
    buf.putVI(this.object)
    return buf.freeze()
  }

  static deserialize(buf: BaseByteBuffer): Location {
    const group = buf.getVI()
    const object = buf.getVI()
    return new Location(group, object)
  }

  equals(other: Location): boolean {
    return this.group === other.group && this.object === other.object
  }

  compare(other: Location): number {
    if (this.group < other.group) return -1
    if (this.group > other.group) return 1
    if (this.object < other.object) return -1
    if (this.object > other.object) return 1
    return 0
  }
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest

  describe('Location', () => {
    it('roundtrip serialization and deserialization (FrozenByteBuffer)', () => {
      const original = new Location(BigInt(1), BigInt(100))
      const serialized = original.serialize()
      const parsed = Location.deserialize(serialized)
      expect(parsed.equals(original)).toBe(true)
    })

    it('roundtrip serialization and deserialization (ByteBuffer)', () => {
      const original = new Location(BigInt(42), BigInt(999))
      const serialized = original.serialize()
      const parsed = Location.deserialize(serialized)
      expect(parsed.equals(original)).toBe(true)
    })

    it('ordering comparison', () => {
      const loc1 = new Location(BigInt(1), BigInt(1))
      const loc2 = new Location(BigInt(1), BigInt(2))
      const loc3 = new Location(BigInt(2), BigInt(1))

      expect(loc1.compare(loc2)).toBeLessThanOrEqual(0)
      expect(loc2.compare(loc3)).toBeLessThanOrEqual(0)
      expect(loc1.compare(loc3)).toBeLessThanOrEqual(0)
      expect(loc2.compare(loc1)).toBe(1)
    })

    it('throws NotEnoughBytesError on insufficient data', () => {
      const buf = new ByteBuffer()
      buf.putVI(BigInt(1)) // missing second value
      const frozen = buf.freeze()
      expect(() => Location.deserialize(frozen)).toThrow(NotEnoughBytesError)
    })

    it('equality check works correctly', () => {
      const a = new Location(BigInt(1), BigInt(1))
      const b = new Location(BigInt(1), BigInt(1))
      const c = new Location(BigInt(2), BigInt(1))

      expect(a.equals(b)).toBe(true)
      expect(a.equals(c)).toBe(false)
    })

    it('handles large 64-bit values', () => {
      const maxVarint = BigInt('4611686018427387903')
      const loc = new Location(maxVarint, maxVarint)
      const serialized = loc.serialize()
      const parsed = Location.deserialize(serialized)
      expect(parsed.equals(loc)).toBe(true)
    })
  })
}
