import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from './byte_buffer'
import { NotEnoughBytesError, LengthExceedsMaxError, KeyValueFormattingError } from '../error/error'

const MAX_VALUE_LENGTH = 2 ** 16 - 1 // 65535

export class KeyValuePair {
  private constructor(
    public readonly typeValue: bigint,
    public readonly value: bigint | Uint8Array,
  ) {}

  static tryNewVarInt(typeValue: bigint | number, value: bigint | number): KeyValuePair {
    const tv = typeof typeValue === 'number' ? BigInt(typeValue) : typeValue
    if (tv % 2n !== 0n) {
      throw new KeyValueFormattingError('KeyValuePair.tryNewVarInt')
    }
    const v = typeof value === 'number' ? BigInt(value) : value
    return new KeyValuePair(tv, v)
  }

  static tryNewBytes(typeValue: bigint | number, value: Uint8Array): KeyValuePair {
    const tv = typeof typeValue === 'number' ? BigInt(typeValue) : typeValue
    if (tv % 2n === 0n) {
      throw new KeyValueFormattingError('KeyValuePair.tryNewBytes')
    }
    const len = value.length
    if (len > MAX_VALUE_LENGTH) {
      throw new LengthExceedsMaxError('KeyValuePair.tryNewBytes', MAX_VALUE_LENGTH, len)
    }
    return new KeyValuePair(tv, value)
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(this.typeValue)
    if (isVarInt(this)) {
      buf.putVI(this.value)
    } else if (isBytes(this)) {
      buf.putLengthPrefixedBytes(this.value)
    }
    return buf.freeze()
  }

  static deserialize(buf: BaseByteBuffer): KeyValuePair {
    const typeValue = buf.getVI()
    if (typeValue % 2n === 0n) {
      const value = buf.getVI()
      return new KeyValuePair(typeValue, value)
    } else {
      const len = buf.getNumberVI()
      if (len > MAX_VALUE_LENGTH) {
        throw new LengthExceedsMaxError('KeyValuePair.deserialize', MAX_VALUE_LENGTH, len)
      }
      const value = buf.getBytes(len)
      return new KeyValuePair(typeValue, value)
    }
  }

  equals(other: KeyValuePair): boolean {
    if (this.typeValue !== other.typeValue) return false
    if (isVarInt(this) && isVarInt(other)) {
      return this.value === other.value
    }
    if (isBytes(this) && isBytes(other)) {
      const a = this.value
      const b = other.value
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
      }
      return true
    }
    return false
  }
}

export function isVarInt(pair: KeyValuePair): pair is KeyValuePair & { value: bigint } {
  return pair.typeValue % 2n === 0n
}

export function isBytes(pair: KeyValuePair): pair is KeyValuePair & { value: Uint8Array } {
  return pair.typeValue % 2n !== 0n
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest

  describe('KeyValuePair', () => {
    it('roundtrip varint', () => {
      const original = KeyValuePair.tryNewVarInt(2, 100)
      const serialized = original.serialize()
      const parsed = KeyValuePair.deserialize(serialized)
      expect(parsed).toEqual(original)
    })

    it('roundtrip bytes', () => {
      const data = new TextEncoder().encode('test')
      const original = KeyValuePair.tryNewBytes(1, data)
      const serialized = original.serialize()
      const parsed = KeyValuePair.deserialize(serialized)
      expect(parsed).toEqual(original)
    })

    it('invalid type for varint', () => {
      expect(() => KeyValuePair.tryNewVarInt(1, 100)).toThrow(KeyValueFormattingError)
    })

    it('invalid type for bytes', () => {
      const data = new Uint8Array([0x78])
      expect(() => KeyValuePair.tryNewBytes(2, data)).toThrow(KeyValueFormattingError)
    })

    it('length exceeds max', () => {
      const over = new Uint8Array(MAX_VALUE_LENGTH + 1)
      expect(() => KeyValuePair.tryNewBytes(1, over)).toThrow(LengthExceedsMaxError)
    })

    it('deserialize not enough bytes', () => {
      const buf = new ByteBuffer()
      buf.putVI(1) // odd → bytes variant
      buf.putVI(5) // length = 5
      buf.putBytes(new Uint8Array([0x61, 0x62, 0x63])) // only 3 bytes
      const frozen = buf.freeze()
      expect(() => KeyValuePair.deserialize(frozen)).toThrow(NotEnoughBytesError)
    })

    it('deserialize length casting error', () => {
      const huge = BigInt(Number.MAX_SAFE_INTEGER) + 1n
      const buf = new ByteBuffer()
      buf.putVI(0)
      buf.putVI(huge)
      const frozen = buf.freeze()
      expect(() => KeyValuePair.deserialize(frozen))
    })
  })
}
