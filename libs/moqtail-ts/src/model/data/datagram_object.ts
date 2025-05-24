import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { KeyValuePair } from '../common/pair'
import { ObjectDatagramType } from './constant'
import { Location } from '../common/location'

export class DatagramObject {
  public readonly trackAlias: bigint
  public readonly location: Location
  private constructor(
    public readonly type: ObjectDatagramType,
    trackAlias: number | bigint,
    location: Location,
    public readonly publisherPriority: number,
    public readonly extensionHeaders: KeyValuePair[] | null,
    public readonly payload: Uint8Array,
  ) {
    this.trackAlias = BigInt(trackAlias)
    this.location = location
  }

  get groupId(): bigint {
    return this.location.group
  }
  get objectId(): bigint {
    return this.location.object
  }

  static newWithExtensions(
    trackAlias: bigint,
    groupId: bigint,
    objectId: bigint,
    publisherPriority: number,
    extensionHeaders: KeyValuePair[],
    payload: Uint8Array,
  ): DatagramObject {
    return new DatagramObject(
      ObjectDatagramType.WithExtensions,
      trackAlias,
      Location.from(groupId, objectId),
      publisherPriority,
      extensionHeaders,
      payload,
    )
  }

  static newWithoutExtensions(
    trackAlias: bigint,
    groupId: bigint,
    objectId: bigint,
    publisherPriority: number,
    payload: Uint8Array,
  ): DatagramObject {
    return new DatagramObject(
      ObjectDatagramType.WithoutExtensions,
      trackAlias,
      Location.from(groupId, objectId),
      publisherPriority,
      null,
      payload,
    )
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(this.type)
    buf.putVI(this.trackAlias)
    buf.putVI(this.location.group)
    buf.putVI(this.location.object)
    buf.putU8(this.publisherPriority)
    if (this.type === ObjectDatagramType.WithExtensions) {
      const extBuf = new ByteBuffer()
      if (this.extensionHeaders) {
        for (const header of this.extensionHeaders) {
          extBuf.putKeyValuePair(header)
        }
      }
      const extBytes = extBuf.toUint8Array()
      buf.putLengthPrefixedBytes(extBytes)
    }
    buf.putBytes(this.payload)
    return buf.freeze()
  }

  static deserialize(buf: BaseByteBuffer): DatagramObject {
    const msgTypeRaw = buf.getNumberVI()
    const msgType = ObjectDatagramType.tryFrom(msgTypeRaw)
    const trackAlias = buf.getVI()
    const groupId = buf.getVI()
    const objectId = buf.getVI()
    const publisherPriority = buf.getU8()
    let extensionHeaders: KeyValuePair[] | null = null
    switch (msgType) {
      case ObjectDatagramType.WithExtensions: {
        const extBytes = buf.getLengthPrefixedBytes()
        const headerBytes = new FrozenByteBuffer(extBytes)
        extensionHeaders = []
        while (headerBytes.remaining > 0) {
          extensionHeaders.push(headerBytes.getKeyValuePair())
        }
        break
      }
      case ObjectDatagramType.WithoutExtensions: {
        break
      }
    }
    const payload = buf.getBytes(buf.remaining)
    return new DatagramObject(
      msgType,
      trackAlias,
      Location.from(groupId, objectId),
      publisherPriority,
      extensionHeaders,
      payload,
    )
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('DatagramObject', () => {
    test('roundtrip', () => {
      const trackAlias = 500n
      const groupId = 9n
      const objectId = 10n
      const publisherPriority = 255
      const extensionHeaders = [
        KeyValuePair.tryNewVarInt(2, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('wololoo')),
      ]
      const payload = new TextEncoder().encode('01239gjawkk92837aldmi')
      const datagramObject = DatagramObject.newWithExtensions(
        trackAlias,
        groupId,
        objectId,
        publisherPriority,
        extensionHeaders,
        payload,
      )
      const frozen = datagramObject.serialize()
      const parsed = DatagramObject.deserialize(frozen)
      expect(parsed.trackAlias).toBe(trackAlias)
      expect(parsed.groupId).toBe(groupId)
      expect(parsed.objectId).toBe(objectId)
      expect(parsed.publisherPriority).toBe(publisherPriority)
      expect(parsed.extensionHeaders).toEqual(extensionHeaders)
      expect(parsed.payload).toEqual(payload)
      expect(frozen.remaining).toBe(0)
    })
  })
}
