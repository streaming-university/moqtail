import { Tuple } from '../common/tuple'
import { ByteBuffer, BaseByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { TrackNameError } from '../error/error'

const MAX_NAMESPACE_TUPLE_COUNT = 32
const MAX_FULL_TRACK_NAME_LENGTH = 4096

export class FullTrackName {
  private constructor(
    public readonly namespace: Tuple,
    public readonly name: Uint8Array,
  ) {}

  toString(): string {
    // Namespace as slash-separated UTF-8 path, name as hex
    const nsStr = this.namespace.toUtf8Path ? this.namespace.toUtf8Path() : Array.from(this.namespace.fields).join('/')
    const nameStr = Array.from(this.name).map(b => b.toString(16).padStart(2, '0')).join('')
    return `${nsStr}:${nameStr}`
  }

  static tryNew(namespace: string | Tuple, name: string | Uint8Array): FullTrackName {
    const nsTuple = typeof namespace === 'string' ? Tuple.fromUtf8Path(namespace) : namespace
    const nsCount = nsTuple.fields.length
    if (nsCount === 0 || nsCount > MAX_NAMESPACE_TUPLE_COUNT) {
      throw new TrackNameError(
        'FullTrackName::tryNew(nsCount)',
        `Namespace cannot be empty or cannot exceed ${MAX_NAMESPACE_TUPLE_COUNT} fields`,
      )
    }
    const nameBytes = typeof name === 'string' ? new TextEncoder().encode(name) : name
    const totalLen = nsTuple.serialize().toUint8Array().length + nameBytes.length
    if (totalLen > MAX_FULL_TRACK_NAME_LENGTH) {
      throw new TrackNameError(
        'FullTrackName::tryNew(totalLen)',
        `Total length cannot exceed ${MAX_FULL_TRACK_NAME_LENGTH}`,
      )
    }
    return new FullTrackName(nsTuple, nameBytes)
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putTuple(this.namespace)
    buf.putLengthPrefixedBytes(this.name)
    return buf.freeze()
  }

  static deserialize(buf: BaseByteBuffer): FullTrackName {
    const namespace = buf.getTuple()
    const nsCount = namespace.fields.length
    if (nsCount === 0 || nsCount > MAX_NAMESPACE_TUPLE_COUNT) {
      throw new TrackNameError(
        'FullTrackName::deserialize(nsCount)',
        `Namespace cannot be empty or cannot exceed ${MAX_NAMESPACE_TUPLE_COUNT} fields`,
      )
    }
    const name = buf.getLengthPrefixedBytes()
    const totalLen = namespace.serialize().toUint8Array().length + name.length
    if (totalLen > MAX_FULL_TRACK_NAME_LENGTH) {
      throw new TrackNameError(
        'FullTrackName::deserialize(totalLen)',
        `Total length cannot exceed ${MAX_FULL_TRACK_NAME_LENGTH}`,
      )
    }
    return new FullTrackName(namespace, name)
  }
}
