import { FetchHeader } from './fetch_header'
import { SubgroupHeader } from './subgroup_header'
import { FrozenByteBuffer, BaseByteBuffer } from '../common/byte_buffer'
import { InvalidTypeError } from '../error'

export type Header = FetchHeader | SubgroupHeader

export namespace Header {
  export function newFetch(...args: ConstructorParameters<typeof FetchHeader>): Header {
    return new FetchHeader(...args)
  }
  export function newSubgroup(...args: ConstructorParameters<typeof SubgroupHeader>): Header {
    return new SubgroupHeader(...args)
  }
  export function isFetch(header: Header): header is FetchHeader {
    return header instanceof FetchHeader
  }
  export function isSubgroup(header: Header): header is SubgroupHeader {
    return header instanceof SubgroupHeader
  }
  export function serialize(header: Header): FrozenByteBuffer {
    return header.serialize()
  }
  export function deserialize(buf: BaseByteBuffer): Header {
    buf.checkpoint()
    const type = buf.getNumberVI()
    buf.restore()
    switch (type) {
      case 0x05:
        return FetchHeader.deserialize(buf)
      case 0x08:
      case 0x09:
      case 0x0a:
      case 0x0b:
      case 0x0c:
      case 0x0d:
        return SubgroupHeader.deserialize(buf)
      default:
        throw new InvalidTypeError('Header::deserialize(type)', `Unknown header type: ${type}`)
    }
  }
}
