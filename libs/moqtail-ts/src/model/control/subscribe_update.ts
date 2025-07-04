import { BaseByteBuffer, ByteBuffer, FrozenByteBuffer } from '../common/byte_buffer'
import { Location } from '../common/location'
import { KeyValuePair } from '../common/pair'
import { ControlMessageType } from '../control/constant'
import { CastingError } from '../error/error'

export class SubscribeUpdate {
  constructor(
    public requestId: bigint,
    public startLocation: Location,
    public endGroup: bigint,
    public subscriberPriority: number,
    public forward: boolean,
    public subscribeParameters: KeyValuePair[],
  ) {}

  serialize(): FrozenByteBuffer {
    const buf = new ByteBuffer()
    buf.putVI(ControlMessageType.SubscribeUpdate)

    const payload = new ByteBuffer()
    payload.putVI(this.requestId)
    payload.putLocation(this.startLocation)
    payload.putVI(this.endGroup)
    payload.putU8(this.subscriberPriority)
    payload.putU8(this.forward ? 1 : 0)
    payload.putVI(this.subscribeParameters.length)

    for (const param of this.subscribeParameters) {
      payload.putBytes(param.serialize().toUint8Array())
    }

    const payloadBytes = payload.toUint8Array()
    buf.putU16(payloadBytes.length)
    buf.putBytes(payloadBytes)

    return buf.freeze()
  }

  static parsePayload(buf: BaseByteBuffer): SubscribeUpdate {
    const requestId = buf.getVI()
    const startLocation = buf.getLocation()
    const endGroup = buf.getVI()
    const subscriberPriority = buf.getU8()
    const forwardRaw = buf.getU8()
    let forward: boolean
    if (forwardRaw === 0) forward = false
    else if (forwardRaw === 1) forward = true
    else {
      throw new Error(`SubscribeUpdate.deserialize forward: Invalid value ${forwardRaw}`)
    }

    const paramCountBig = buf.getVI()
    const paramCount = Number(paramCountBig)
    if (BigInt(paramCount) !== paramCountBig) {
      throw new CastingError('SubscribeUpdate.deserialize paramCount', 'bigint', 'number', `${paramCountBig}`)
    }

    const subscribeParameters: KeyValuePair[] = []
    for (let i = 0; i < paramCount; i++) {
      subscribeParameters.push(KeyValuePair.deserialize(buf))
    }

    return new SubscribeUpdate(requestId, startLocation, endGroup, subscriberPriority, forward, subscribeParameters)
  }

  equals(other: SubscribeUpdate): boolean {
    if (
      this.requestId !== other.requestId ||
      this.endGroup !== other.endGroup ||
      this.subscriberPriority !== other.subscriberPriority ||
      this.forward !== other.forward ||
      (this.startLocation === undefined) !== (other.startLocation === undefined) ||
      (this.startLocation && other.startLocation && !this.startLocation.equals(other.startLocation)) ||
      this.subscribeParameters.length !== other.subscribeParameters.length
    ) {
      return false
    }

    for (let i = 0; i < this.subscribeParameters.length; i++) {
      const a = this.subscribeParameters[i]
      const b = other.subscribeParameters[i]

      if (!a || !b || !a.equals(b)) {
        return false
      }
    }

    return true
  }
}

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest

  describe('SubscribeUpdate', () => {
    function buildTestUpdate(): SubscribeUpdate {
      return new SubscribeUpdate(120205n, new Location(81n, 81n), 25n, 31, true, [
        KeyValuePair.tryNewVarInt(0n, 10n),
        KeyValuePair.tryNewBytes(1n, new TextEncoder().encode("I'll sync you up")),
      ])
    }

    it('should roundtrip correctly', () => {
      const update = buildTestUpdate()
      const serialized = update.serialize()

      const buf = new ByteBuffer()
      buf.putBytes(serialized.toUint8Array())

      const msgType = buf.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.SubscribeUpdate))

      const msgLength = buf.getU16()
      expect(msgLength).toBe(buf.remaining)

      const deserialized = SubscribeUpdate.parsePayload(buf)
      expect(deserialized.equals(update)).toBe(true)
      expect(buf.remaining).toBe(0)
    })

    it('should roundtrip with excess trailing bytes', () => {
      const update = buildTestUpdate()
      const serialized = update.serialize()
      const extra = new Uint8Array([...serialized.toUint8Array(), 9, 1, 1])

      const buf = new ByteBuffer()
      buf.putBytes(extra)

      const msgType = buf.getVI()
      expect(msgType).toBe(BigInt(ControlMessageType.SubscribeUpdate))

      const msgLength = buf.getU16()
      expect(msgLength).toBe(buf.remaining - 3)

      const deserialized = SubscribeUpdate.parsePayload(buf)
      expect(deserialized.equals(update)).toBe(true)

      const trailing = buf.toUint8Array().slice(buf.offset)
      expect(Array.from(trailing)).toEqual([9, 1, 1])
    })

    it('should throw on partial message', () => {
      const update = buildTestUpdate()
      const serialized = update.serialize()
      const serializedBytes = serialized.toUint8Array()
      const partial = serializedBytes.slice(0, Math.floor(serializedBytes.length / 2))

      const buf = new ByteBuffer()
      buf.putBytes(partial)

      try {
        buf.getVI()
        buf.getU16()
        expect(() => SubscribeUpdate.parsePayload(buf)).toThrow()
      } catch (err) {
        expect(err).toBeInstanceOf(Error)
      }
    })
    it('should handle empty subscribeParameters', () => {
      const update = new SubscribeUpdate(120206n, new Location(82n, 82n), 26n, 15, false, [])
      const serialized = update.serialize()
      const buf = new ByteBuffer()
      buf.putBytes(serialized.toUint8Array())
      buf.getVI()
      buf.getU16()
      const deserialized = SubscribeUpdate.parsePayload(buf)
      expect(deserialized.equals(update)).toBe(true)
    })

    it('should throw on invalid forward value', () => {
      const update = buildTestUpdate()
      const serialized = update.serialize()
      const buf = new ByteBuffer()
      buf.putBytes(serialized.toUint8Array())

      buf.getVI() // Skip message type
      buf.getU16() // Skip payload length
      buf.getVI() // Skip requestId
      buf.getLocation() // Skip startLocation
      buf.getVI() // Skip endGroup
      buf.getU8() // Skip subscriberPriority

      // Overwrite forward byte
      buf.toUint8Array()[buf.offset] = 99 // Invalid value
      expect(() => SubscribeUpdate.parsePayload(buf)).toThrow('Invalid value')
    })
  })
}
