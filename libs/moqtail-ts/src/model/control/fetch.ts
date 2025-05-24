import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { Location } from '../common/location'
import { KeyValuePair } from '../common/pair'
import { ControlMessageType, FetchType, fetchTypeFromBigInt, GroupOrder, groupOrderFromNumber } from './constant'
import { LengthExceedsMaxError, NotEnoughBytesError } from '../error/error'
import { FullTrackName } from '../data'

export class StandAloneFetchProps {
  constructor(
    public readonly fullTrackName: FullTrackName,
    public readonly startLocation: Location,
    public readonly endLocation: Location,
  ) {}
}

export class JoiningFetchProps {
  constructor(
    public readonly joiningRequestId: bigint,
    public readonly joiningStart: bigint,
  ) {}
}

export class Fetch {
  public readonly requestId: bigint
  public readonly subscriberPriority: number
  public readonly groupOrder: GroupOrder
  public readonly fetchType: FetchType
  public readonly standaloneFetchProps?: StandAloneFetchProps | undefined
  public readonly joiningFetchProps?: JoiningFetchProps | undefined
  public readonly parameters: KeyValuePair[]

  private constructor(
    requestId: bigint,
    subscriberPriority: number,
    groupOrder: GroupOrder,
    fetchType: FetchType,
    parameters: KeyValuePair[],
    standaloneFetchProps: StandAloneFetchProps | undefined,
    joiningFetchProps: JoiningFetchProps | undefined,
  ) {
    this.requestId = requestId
    this.subscriberPriority = subscriberPriority
    this.groupOrder = groupOrder
    this.fetchType = fetchType
    this.parameters = parameters
    this.standaloneFetchProps = standaloneFetchProps
    this.joiningFetchProps = joiningFetchProps
  }

  static newStandAlone(
    requestId: bigint,
    subscriberPriority: number,
    groupOrder: GroupOrder,
    fullTrackName: FullTrackName,
    startLocation: Location,
    endLocation: Location,
    parameters: KeyValuePair[] = [],
  ): Fetch {
    const standaloneFetchProps = new StandAloneFetchProps(fullTrackName, startLocation, endLocation)
    return new Fetch(
      requestId,
      subscriberPriority,
      groupOrder,
      FetchType.StandAlone,
      parameters,
      standaloneFetchProps,
      undefined,
    )
  }

  static newAbsolute(
    requestId: bigint,
    subscriberPriority: number,
    groupOrder: GroupOrder,
    joiningRequestId: bigint,
    joiningStart: bigint,
    parameters: KeyValuePair[] = [],
  ): Fetch {
    const joiningFetchProps = new JoiningFetchProps(joiningRequestId, joiningStart)
    return new Fetch(
      requestId,
      subscriberPriority,
      groupOrder,
      FetchType.Absolute,
      parameters,
      undefined,
      joiningFetchProps,
    )
  }

  static newRelative(
    requestId: bigint,
    subscriberPriority: number,
    groupOrder: GroupOrder,
    joiningRequestId: bigint,
    joiningStart: bigint,
    parameters: KeyValuePair[] = [],
  ): Fetch {
    const joiningFetchProps = new JoiningFetchProps(joiningRequestId, joiningStart)
    return new Fetch(
      requestId,
      subscriberPriority,
      groupOrder,
      FetchType.Relative,
      parameters,
      undefined,
      joiningFetchProps,
    )
  }

  getType(): ControlMessageType {
    return ControlMessageType.Fetch
  }

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.Fetch)
    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    payload.putU8(this.subscriberPriority)
    payload.putU8(this.groupOrder)
    payload.putVI(this.fetchType)
    switch (this.fetchType) {
      case FetchType.Absolute:
      case FetchType.Relative: {
        payload.putVI(this.joiningFetchProps!.joiningRequestId)
        payload.putVI(this.joiningFetchProps!.joiningStart)
        break
      }
      case FetchType.StandAlone: {
        payload.putFullTrackName(this.standaloneFetchProps!.fullTrackName)
        payload.putLocation(this.standaloneFetchProps!.startLocation)
        payload.putLocation(this.standaloneFetchProps!.endLocation)
        break
      }
    }
    payload.putVI(this.parameters.length)
    for (const param of this.parameters) {
      payload.putKeyValuePair(param)
    }
    const payloadBytes = payload.toUint8Array()
    if (payloadBytes.length > 0xffff) {
      throw new LengthExceedsMaxError('Fetch::serialize(payload_length)', 0xffff, payloadBytes.length)
    }
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)
    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): Fetch {
    const requestId = buf.getVI()
    if (buf.remaining < 1) throw new NotEnoughBytesError('Fetch::parse_payload(subscriber_priority)', 1, buf.remaining)
    const subscriberPriority = buf.getU8()
    if (buf.remaining < 1) throw new NotEnoughBytesError('Fetch::parse_payload(group_order)', 1, buf.remaining)
    const groupOrderRaw = buf.getU8()
    const groupOrder = groupOrderFromNumber(groupOrderRaw)
    const fetchTypeRaw = buf.getVI()
    const fetchType = fetchTypeFromBigInt(fetchTypeRaw)
    let standaloneFetchProps: StandAloneFetchProps | undefined = undefined
    let joiningFetchProps: JoiningFetchProps | undefined = undefined
    switch (fetchType) {
      case FetchType.Absolute | FetchType.Relative: {
        const joiningRequestId = buf.getVI()
        const joiningStart = buf.getVI()
        joiningFetchProps = new JoiningFetchProps(joiningRequestId, joiningStart)
        break
      }
      case FetchType.StandAlone: {
        const fullTrackName = buf.getFullTrackName()
        const startLocation = buf.getLocation()
        const endLocation = buf.getLocation()
        standaloneFetchProps = new StandAloneFetchProps(fullTrackName, startLocation, endLocation)
        break
      }
    }
    const paramCount = buf.getNumberVI()
    const parameters: KeyValuePair[] = new Array(paramCount)
    for (let i = 0; i < paramCount; i++) {
      parameters[i] = buf.getKeyValuePair()
    }
    return new Fetch(
      requestId,
      subscriberPriority,
      groupOrder,
      fetchType,
      parameters,
      standaloneFetchProps,
      joiningFetchProps,
    )
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('Fetch', () => {
    test('roundtrip', () => {
      const requestId = 161803n
      const subscriberPriority = 15
      const groupOrder = GroupOrder.Descending
      const joiningFetchProps = new JoiningFetchProps(119n, 73n)
      const parameters = [
        KeyValuePair.tryNewVarInt(4444, 12321n),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('fetch me ok')),
      ]
      const fetch = Fetch.newAbsolute(
        requestId,
        subscriberPriority,
        groupOrder,
        joiningFetchProps.joiningRequestId,
        joiningFetchProps.joiningStart,
        parameters,
      )
      const serialized = fetch.serialize()
      const buf = new ByteBuffer()
      buf.putBytes(serialized.toUint8Array())
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.Fetch))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining)
      const deserialized = Fetch.parsePayload(frozen)
      expect(deserialized.requestId).toBe(fetch.requestId)
      expect(deserialized.subscriberPriority).toBe(fetch.subscriberPriority)
      expect(deserialized.groupOrder).toBe(fetch.groupOrder)
      expect(deserialized.fetchType).toBe(fetch.fetchType)
      expect(deserialized.joiningFetchProps?.joiningRequestId).toBe(joiningFetchProps.joiningRequestId)
      expect(deserialized.joiningFetchProps?.joiningStart).toBe(joiningFetchProps.joiningStart)
      expect(deserialized.parameters).toEqual(fetch.parameters)
      expect(frozen.remaining).toBe(0)
    })

    test('excess roundtrip', () => {
      const requestId = 161803n
      const subscriberPriority = 15
      const groupOrder = GroupOrder.Descending
      const joiningFetchProps = new JoiningFetchProps(119n, 73n)
      const parameters = [
        KeyValuePair.tryNewVarInt(4444, 12321n),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('fetch me ok')),
      ]
      const fetch = Fetch.newAbsolute(
        requestId,
        subscriberPriority,
        groupOrder,
        joiningFetchProps.joiningRequestId,
        joiningFetchProps.joiningStart,
        parameters,
      )
      const serialized = fetch.serialize().toUint8Array()
      const excess = new Uint8Array([9, 1, 1])
      const buf = new ByteBuffer()
      buf.putBytes(serialized)
      buf.putBytes(excess)
      const frozen = buf.freeze()
      const msgType = frozen.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.Fetch))
      const msgLength = frozen.getU16()
      expect(msgLength).toBe(frozen.remaining - 3)
      const deserialized = Fetch.parsePayload(frozen)
      expect(deserialized.requestId).toBe(fetch.requestId)
      expect(deserialized.subscriberPriority).toBe(fetch.subscriberPriority)
      expect(deserialized.groupOrder).toBe(fetch.groupOrder)
      expect(deserialized.fetchType).toBe(fetch.fetchType)
      expect(deserialized.joiningFetchProps?.joiningRequestId).toBe(joiningFetchProps.joiningRequestId)
      expect(deserialized.joiningFetchProps?.joiningStart).toBe(joiningFetchProps.joiningStart)
      expect(deserialized.parameters).toEqual(fetch.parameters)
      expect(Array.from(frozen.getBytes(3))).toEqual([9, 1, 1])
    })

    test('partial message', () => {
      const requestId = 161803n
      const subscriberPriority = 15
      const groupOrder = GroupOrder.Descending
      const joiningFetchProps = new JoiningFetchProps(119n, 73n)
      const parameters = [
        KeyValuePair.tryNewVarInt(4444, 12321n),
        KeyValuePair.tryNewBytes(1, new TextEncoder().encode('fetch me ok')),
      ]
      const fetch = Fetch.newAbsolute(
        requestId,
        subscriberPriority,
        groupOrder,
        joiningFetchProps.joiningRequestId,
        joiningFetchProps.joiningStart,
        parameters,
      )
      const serialized = fetch.serialize().toUint8Array()
      const upper = Math.floor(serialized.length / 2)
      const partial = serialized.slice(0, upper)
      const frozen = new FrozenByteBuffer(partial)
      expect(() => {
        frozen.getVI()
        frozen.getU16()
        Fetch.parsePayload(frozen)
      }).toThrow()
    })
  })
}
