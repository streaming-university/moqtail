import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from './byte_buffer'
import { NotEnoughBytesError, CastingError } from '../error/error'

const PATH_SEPARATOR = '/'

export class TupleField {
  constructor(public readonly value: Uint8Array) {}

  static fromUtf8(str: string): TupleField {
    return new TupleField(new TextEncoder().encode(str))
  }

  toUtf8(): string {
    return new TextDecoder().decode(this.value)
  }

  serialize(): Uint8Array {
    const buf = new ByteBuffer()
    buf.putVI(this.value.length)
    buf.putBytes(this.value)
    return buf.toUint8Array()
  }

  static deserialize(buf: BaseByteBuffer): TupleField {
    const lenBig = buf.getVI()
    const len = Number(lenBig)

    if (BigInt(len) !== lenBig) {
      throw new CastingError('TupleField.deserialize', 'bigint', 'number', `${lenBig}`)
    }

    const bytes = buf.getBytes(len)
    return new TupleField(bytes)
  }
}

export class Tuple {
  constructor(public readonly fields: TupleField[] = []) {}

  static fromUtf8Path(path: string): Tuple {
    const parts = path.split(PATH_SEPARATOR).filter(Boolean)
    const fields = parts.map(TupleField.fromUtf8)
    return new Tuple(fields)
  }

  toUtf8Path(): string {
    return this.fields.map((f) => PATH_SEPARATOR + f.toUtf8()).join('')
  }

  add(field: TupleField): void {
    this.fields.push(field)
  }

  get(index: number): TupleField {
    const field = this.fields[index]
    if (!field) throw new Error('Field not found at index')
    return field
  }

  set(index: number, field: TupleField): void {
    this.fields[index] = field
  }

  clear(): void {
    this.fields.length = 0
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(this.fields.length)
    for (const field of this.fields) {
      buf.putBytes(field.serialize())
    }
    return buf.freeze()
  }

  static deserialize(buf: BaseByteBuffer): Tuple {
    const countBig = buf.getVI()
    const count = Number(countBig)

    if (BigInt(count) !== countBig) {
      throw new CastingError('Tuple.deserialize', 'bigint', 'number', `${countBig}`)
    }

    const fields: TupleField[] = []
    for (let i = 0; i < count; i++) {
      const field = TupleField.deserialize(buf)
      fields.push(field)
    }

    return new Tuple(fields)
  }

  equals(other: Tuple): boolean {
    if (this.fields.length !== other.fields.length) return false
    return this.fields.every((f, i) => f.value.toString() === other.fields[i]!.value.toString())
  }
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest

  describe('TupleField', () => {
    it('should serialize and deserialize correctly', () => {
      const field = TupleField.fromUtf8('hello')
      const serialized = field.serialize()

      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      const decoded = TupleField.deserialize(buf)

      expect(decoded.value).toEqual(field.value)
      expect(buf.remaining).toBe(0)
    })

    it('should throw on not enough bytes', () => {
      const buf = new ByteBuffer()
      buf.putVI(10)
      buf.putBytes(new TextEncoder().encode('short'))

      const frozen = buf.freeze()
      expect(() => TupleField.deserialize(frozen)).toThrow(NotEnoughBytesError)
    })
  })

  describe('Tuple', () => {
    it('should add, get, and convert to path', () => {
      const tuple = new Tuple()
      tuple.add(TupleField.fromUtf8('hello'))
      tuple.add(TupleField.fromUtf8('world'))

      expect(tuple.fields.length).toBe(2)
      expect(tuple.get(0).toUtf8()).toBe('hello')
      expect(tuple.get(1).toUtf8()).toBe('world')
      expect(tuple.toUtf8Path()).toBe('/hello/world')
    })

    it('should serialize and deserialize correctly', () => {
      const tuple = Tuple.fromUtf8Path('/hello/world')
      const serialized = tuple.serialize()

      const decoded = Tuple.deserialize(serialized)

      expect(tuple.equals(decoded)).toBe(true)
      expect(serialized.remaining).toBe(0)
    })

    it('should throw on too few bytes for a field', () => {
      const buf = new ByteBuffer()
      buf.putVI(2) // tuple with 2 fields
      buf.putVI(5)
      buf.putBytes(new TextEncoder().encode('hello'))
      buf.putVI(5) // but second field is incomplete

      const frozen = buf.freeze()
      expect(() => Tuple.deserialize(frozen)).toThrow(NotEnoughBytesError)
    })

    it('should support equality comparison', () => {
      const t1 = Tuple.fromUtf8Path('/hello/world')
      const t2 = Tuple.fromUtf8Path('/hello/world')
      const t3 = Tuple.fromUtf8Path('/hello/there')

      expect(t1.equals(t2)).toBe(true)
      expect(t1.equals(t3)).toBe(false)
    })

    it('should build from utf8 path correctly', () => {
      const tuple = Tuple.fromUtf8Path('/this/is/a/very/long/path')
      expect(tuple.fields.length).toBe(6)
      expect(tuple.toUtf8Path()).toBe('/this/is/a/very/long/path')
    })
  })
}
