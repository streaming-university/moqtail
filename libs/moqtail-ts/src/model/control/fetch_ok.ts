import { ByteBuffer, FrozenByteBuffer, BaseByteBuffer } from '../common/byte_buffer'
import { ControlMessageType, GroupOrder, groupOrderFromNumber } from './constant'
import { Location } from '../common/location'
import { KeyValuePair } from '../common/pair'
import { LengthExceedsMaxError, NotEnoughBytesError, ProtocolViolationError } from '../error/error'

export class FetchOk {
  private constructor(
    public readonly requestId: bigint,
    public readonly groupOrder: GroupOrder,
    public readonly endOfTrack: boolean,
    public readonly endLocation: Location,
    public readonly subscribeParameters: KeyValuePair[],
  ) {}

  static newAscending(
    requestId: bigint | number,
    endOfTrack: boolean,
    endLocation: Location,
    subscribeParameters: KeyValuePair[],
  ): FetchOk {
    return new FetchOk(BigInt(requestId), GroupOrder.Ascending, endOfTrack, endLocation, subscribeParameters)
  }

  static newDescending(
    requestId: bigint | number,
    endOfTrack: boolean,
    endLocation: Location,
    subscribeParameters: KeyValuePair[],
  ): FetchOk {
    return new FetchOk(BigInt(requestId), GroupOrder.Descending, endOfTrack, endLocation, subscribeParameters)
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(BigInt(ControlMessageType.FetchOk))
    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    payload.putU8(this.groupOrder)
    payload.putU8(this.endOfTrack ? 1 : 0)
    payload.putLocation(this.endLocation)
    payload.putVI(this.subscribeParameters.length)
    for (const param of this.subscribeParameters) {
      payload.putKeyValuePair(param)
    }
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('FetchOk::serialize(payloadBytes.length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): FetchOk {
    const requestId = buf.getVI()
    if (buf.remaining < 1) {
      throw new NotEnoughBytesError('FetchOk::parsePayload(group_order)', 1, 0)
    }
    const groupOrderRaw = buf.getU8()
    const groupOrder = groupOrderFromNumber(groupOrderRaw)
    if (groupOrder === GroupOrder.Original) {
      throw new ProtocolViolationError(
        'FetchOk::parsePayload(groupOrder)',
        'Group order must be Ascending(0x01) or Descending(0x02)',
      )
    }
    if (buf.remaining < 1) {
      throw new NotEnoughBytesError('FetchOk::parsePayload(endOfTrack)', 1, 0)
    }
    const endOfTrackRaw = buf.getU8()
    let endOfTrack: boolean
    if (endOfTrackRaw === 0) {
      endOfTrack = false
    } else if (endOfTrackRaw === 1) {
      endOfTrack = true
    } else {
      throw new ProtocolViolationError(
        'FetchOk::parsePayload(endOfTrack)',
        'End of track must be true(0x01) or false(0x00)',
      )
    }
    const endLocation = buf.getLocation()
    const paramCount = buf.getNumberVI()
    const subscribeParameters: KeyValuePair[] = new Array(paramCount)
    for (let i = 0; i < paramCount; i++) {
      subscribeParameters[i] = buf.getKeyValuePair()
    }
    return new FetchOk(requestId, groupOrder, endOfTrack, endLocation, subscribeParameters)
  }
}

if (import.meta.vitest) {
  const { describe, expect, test } = import.meta.vitest
  describe('FetchOk', () => {
    test('roundtrip', () => {
      const requestId = 271828n
      const endOfTrack = true
      const endLocation = new Location(17n, 57n)
      const subscribeParameters = [
        KeyValuePair.tryNewVarInt(4444, 12321),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('fetch me ok')),
      ]
      const msg = FetchOk.newAscending(requestId, endOfTrack, endLocation, subscribeParameters)
      const frozen = msg.serialize()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.FetchOk))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const parsed = FetchOk.parsePayload(frozen)
      expect(parsed.requestId).toBe(requestId)
      expect(parsed.groupOrder).toBe(GroupOrder.Ascending)
      expect(parsed.endOfTrack).toBe(endOfTrack)
      expect(parsed.endLocation.equals(endLocation)).toBe(true)
      expect(parsed.subscribeParameters).toEqual(subscribeParameters)
      expect(frozen.remaining).toBe(0)
    })

    test('excess roundtrip', () => {
      const requestId = 271828n
      const endOfTrack = true
      const endLocation = new Location(17n, 57n)
      const subscribeParameters = [
        KeyValuePair.tryNewVarInt(4444, 12321),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('fetch me ok')),
      ]
      const msg = FetchOk.newAscending(requestId, endOfTrack, endLocation, subscribeParameters)
      const serialized = msg.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const msgType = buf.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.FetchOk))
      const msgLength = buf.getU16()
      expect(msgLength).toBe(buf.remaining - 3)
      const parsed = FetchOk.parsePayload(buf)
      expect(parsed.requestId).toBe(requestId)
      expect(parsed.groupOrder).toBe(GroupOrder.Ascending)
      expect(parsed.endOfTrack).toBe(endOfTrack)
      expect(parsed.endLocation.equals(endLocation)).toBe(true)
      expect(parsed.subscribeParameters).toEqual(subscribeParameters)
      expect(buf.remaining).toBe(3)
    })

    test('partial message', () => {
      const requestId = 271828n
      const endOfTrack = true
      const endLocation = new Location(17n, 57n)
      const subscribeParameters = [
        KeyValuePair.tryNewVarInt(4444, 12321),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('fetch me ok')),
      ]
      const msg = FetchOk.newAscending(requestId, endOfTrack, endLocation, subscribeParameters)
      const serialized = msg.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        FetchOk.parsePayload(frozen)
      }).toThrow()
    })
  })
}
