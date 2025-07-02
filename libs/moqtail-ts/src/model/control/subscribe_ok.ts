import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { Location } from '../common/location'
import { KeyValuePair } from '../common/pair'
import { ControlMessageType, GroupOrder, groupOrderFromNumber } from './constant'
import { LengthExceedsMaxError, NotEnoughBytesError, ProtocolViolationError } from '../error/error'

export class SubscribeOk {
  requestId: bigint
  expires: bigint
  groupOrder: GroupOrder
  contentExists: boolean
  largestLocation?: Location | undefined
  subscribeParameters: KeyValuePair[]

  private constructor(
    requestId: bigint,
    expires: bigint,
    groupOrder: GroupOrder,
    contentExists: boolean,
    largestLocation: Location | undefined,
    subscribeParameters: KeyValuePair[],
  ) {
    this.requestId = requestId
    this.expires = expires
    this.groupOrder = groupOrder
    this.contentExists = contentExists
    this.largestLocation = largestLocation
    this.subscribeParameters = subscribeParameters
  }

  static newAscendingNoContent(requestId: bigint, expires: bigint, subscribeParameters: KeyValuePair[]): SubscribeOk {
    return new SubscribeOk(requestId, expires, GroupOrder.Ascending, false, undefined, subscribeParameters)
  }

  static newDescendingNoContent(requestId: bigint, expires: bigint, subscribeParameters: KeyValuePair[]): SubscribeOk {
    return new SubscribeOk(requestId, expires, GroupOrder.Descending, false, undefined, subscribeParameters)
  }

  static newAscendingWithContent(
    requestId: bigint,
    expires: bigint,
    largestLocation: Location,
    subscribeParameters: KeyValuePair[],
  ): SubscribeOk {
    return new SubscribeOk(requestId, expires, GroupOrder.Ascending, true, largestLocation, subscribeParameters)
  }

  static newDescendingWithContent(
    requestId: bigint,
    expires: bigint,
    largestLocation: Location,
    subscribeParameters: KeyValuePair[],
  ): SubscribeOk {
    return new SubscribeOk(requestId, expires, GroupOrder.Descending, true, largestLocation, subscribeParameters)
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.SubscribeOk)

    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    payload.putVI(this.expires)
    payload.putU8(this.groupOrder)
    if (this.contentExists) {
      payload.putU8(1)
      payload.putLocation(this.largestLocation!)
    } else {
      payload.putU8(0)
    }
    payload.putVI(this.subscribeParameters.length)
    for (const param of this.subscribeParameters) {
      payload.putKeyValuePair(param)
    }
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('SubscribeOk::serialize(payloadBytes.length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): SubscribeOk {
    const requestId = buf.getVI()
    const expires = buf.getVI()
    if (buf.remaining < 1) throw new NotEnoughBytesError('SubscribeOk::parsePayload(groupOrder)', 1, buf.remaining)
    const groupOrderRaw = buf.getU8()
    const groupOrder = groupOrderFromNumber(groupOrderRaw)
    if (groupOrder === GroupOrder.Original) {
      throw new ProtocolViolationError(
        'SubscribeOk::parsePayload(groupOrder)',
        'Group order must be Ascending(0x01) or Descending(0x02)',
      )
    }
    if (buf.remaining < 1) throw new NotEnoughBytesError('SubscribeOk::parsePayload(contentExists)', 1, buf.remaining)
    const contentExistsRaw = buf.getU8()
    let contentExists: boolean
    if (contentExistsRaw === 0) {
      contentExists = false
    } else if (contentExistsRaw === 1) {
      contentExists = true
    } else {
      throw new ProtocolViolationError('SubscribeOk::parsePayload', `Invalid Content Exists value: ${contentExistsRaw}`)
    }
    let largestLocation: Location | undefined = undefined
    if (contentExists) {
      largestLocation = buf.getLocation()
    }
    const paramCount = buf.getNumberVI()
    const subscribeParameters: KeyValuePair[] = new Array(paramCount)
    for (let i = 0; i < paramCount; i++) {
      subscribeParameters[i] = buf.getKeyValuePair()
    }
    return new SubscribeOk(requestId, expires, groupOrder, contentExists, largestLocation, subscribeParameters)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('SubscribeOk', () => {
    test('roundtrip', () => {
      const requestId = 145136n
      const expires = 16n
      const largestLocation = new Location(34n, 0n)
      const subscribeParameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('9 gifted subs from Dr.Doofishtein')),
      ]
      const subscribeOk = SubscribeOk.newAscendingWithContent(requestId, expires, largestLocation, subscribeParameters)
      const frozen = subscribeOk.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.SubscribeOk))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = SubscribeOk.parsePayload(frozen)
      expect(deserialized.requestId).toBe(subscribeOk.requestId)
      expect(deserialized.expires).toBe(subscribeOk.expires)
      expect(deserialized.groupOrder).toBe(subscribeOk.groupOrder)
      expect(deserialized.contentExists).toBe(subscribeOk.contentExists)
      expect(deserialized.largestLocation?.equals(largestLocation)).toBe(true)
      expect(deserialized.subscribeParameters).toEqual(subscribeOk.subscribeParameters)
      expect(frozen.remaining).toBe(0)
    })

    test('excess roundtrip', () => {
      const requestId = 145136n
      const expires = 16n
      const largestLocation = new Location(34n, 0n)
      const subscribeParameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('9 gifted subs from Dr.Doofishtein')),
      ]
      const subscribeOk = SubscribeOk.newAscendingWithContent(requestId, expires, largestLocation, subscribeParameters)
      const serialized = subscribeOk.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.SubscribeOk))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = SubscribeOk.parsePayload(frozen)
      expect(deserialized.requestId).toBe(subscribeOk.requestId)
      expect(deserialized.expires).toBe(subscribeOk.expires)
      expect(deserialized.groupOrder).toBe(subscribeOk.groupOrder)
      expect(deserialized.contentExists).toBe(subscribeOk.contentExists)
      expect(deserialized.largestLocation?.equals(largestLocation)).toBe(true)
      expect(deserialized.subscribeParameters).toEqual(subscribeOk.subscribeParameters)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })

    test('partial message', () => {
      const requestId = 145136n
      const expires = 16n

      const largestLocation = new Location(34n, 0n)
      const subscribeParameters = [
        KeyValuePair.tryNewVarInt(0, 10),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('9 gifted subs from Dr.Doofishtein')),
      ]
      const subscribeOk = SubscribeOk.newAscendingWithContent(requestId, expires, largestLocation, subscribeParameters)
      const serialized = subscribeOk.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        SubscribeOk.parsePayload(frozen)
      }).toThrow()
    })
  })
}
