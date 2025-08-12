import { FrozenByteBuffer } from '../common/byte_buffer'
import { ControlMessageType, FetchType, GroupOrder } from './constant'
import { Announce } from './announce'
import { AnnounceCancel } from './announce_cancel'
import { AnnounceError } from './announce_error'
import { AnnounceOk } from './announce_ok'
import { ClientSetup } from './client_setup'
import { Fetch } from './fetch'
import { FetchCancel } from './fetch_cancel'
import { FetchError } from './fetch_error'
import { FetchOk } from './fetch_ok'
import { GoAway } from './goaway'
import { MaxRequestId } from './max_request_id'
import { ServerSetup } from './server_setup'
import { Subscribe } from './subscribe'
import { SubscribeDone } from './subscribe_done'
import { SubscribeError } from './subscribe_error'
import { SubscribeOk } from './subscribe_ok'
import { SubscribeUpdate } from './subscribe_update'
import { RequestsBlocked } from './requests_blocked'
import { TrackStatus } from './track_status'
import { TrackStatusRequest } from './track_status_request'
import { Unannounce } from './unannounce'
import { Unsubscribe } from './unsubscribe'
import { SubscribeAnnounces } from './subscribe_announces'
import { SubscribeAnnouncesOk } from './subscribe_announces_ok'
import { SubscribeAnnouncesError } from './subscribe_announces_error'
import { UnsubscribeAnnounces } from './unsubscribe_announces'
import { NotEnoughBytesError } from '../error/error'
import { Tuple, KeyValuePair } from '../common'

export type ControlMessage =
  | Announce
  | AnnounceCancel
  | AnnounceError
  | AnnounceOk
  | ClientSetup
  | Fetch
  | FetchCancel
  | FetchError
  | FetchOk
  | GoAway
  | MaxRequestId
  | ServerSetup
  | Subscribe
  | SubscribeDone
  | SubscribeError
  | SubscribeOk
  | SubscribeUpdate
  | RequestsBlocked
  | TrackStatus
  | TrackStatusRequest
  | Unannounce
  | Unsubscribe
  | SubscribeAnnounces
  | SubscribeAnnouncesOk
  | SubscribeAnnouncesError
  | UnsubscribeAnnounces

export namespace ControlMessage {
  export function deserialize(buf: FrozenByteBuffer): ControlMessage {
    const messageTypeRaw = buf.getVI()
    const messageType = ControlMessageType.tryFrom(messageTypeRaw)
    const payloadLength = buf.getU16()
    if (buf.remaining < payloadLength)
      throw new NotEnoughBytesError('ControlMessage.deserialize(payload_bytes)', payloadLength, buf.remaining)
    const payloadBytes = buf.getBytes(payloadLength)
    const payload = new FrozenByteBuffer(payloadBytes)
    switch (messageType) {
      case ControlMessageType.Announce:
        return Announce.parsePayload(payload)
      case ControlMessageType.AnnounceCancel:
        return AnnounceCancel.parsePayload(payload)
      case ControlMessageType.AnnounceError:
        return AnnounceError.parsePayload(payload)
      case ControlMessageType.AnnounceOk:
        return AnnounceOk.parsePayload(payload)
      case ControlMessageType.ClientSetup:
        return ClientSetup.parsePayload(payload)
      case ControlMessageType.Fetch:
        return Fetch.parsePayload(payload)
      case ControlMessageType.FetchCancel:
        return FetchCancel.parsePayload(payload)
      case ControlMessageType.FetchError:
        return FetchError.parsePayload(payload)
      case ControlMessageType.FetchOk:
        return FetchOk.parsePayload(payload)
      case ControlMessageType.GoAway:
        return GoAway.parsePayload(payload)
      case ControlMessageType.MaxRequestId:
        return MaxRequestId.parsePayload(payload)
      case ControlMessageType.ServerSetup:
        return ServerSetup.parsePayload(payload)
      case ControlMessageType.Subscribe:
        return Subscribe.parsePayload(payload)
      case ControlMessageType.SubscribeDone:
        return SubscribeDone.parsePayload(payload)
      case ControlMessageType.SubscribeError:
        return SubscribeError.parsePayload(payload)
      case ControlMessageType.SubscribeOk:
        return SubscribeOk.parsePayload(payload)
      case ControlMessageType.SubscribeUpdate:
        return SubscribeUpdate.parsePayload(payload)
      case ControlMessageType.RequestsBlocked:
        return RequestsBlocked.parsePayload(payload)
      case ControlMessageType.TrackStatus:
        return TrackStatus.parsePayload(payload)
      case ControlMessageType.TrackStatusRequest:
        return TrackStatusRequest.parsePayload(payload)
      case ControlMessageType.Unannounce:
        return Unannounce.parsePayload(payload)
      case ControlMessageType.Unsubscribe:
        return Unsubscribe.parsePayload(payload)
      case ControlMessageType.SubscribeAnnounces:
        return SubscribeAnnounces.parsePayload(payload)
      case ControlMessageType.SubscribeAnnouncesOk:
        return SubscribeAnnouncesOk.parsePayload(payload)
      case ControlMessageType.SubscribeAnnouncesError:
        return SubscribeAnnouncesError.parsePayload(payload)
      case ControlMessageType.UnsubscribeAnnounces:
        return UnsubscribeAnnounces.parsePayload(payload)
      default:
        // This case should ideally be unreachable if controlMessageTypeFromBigInt is exhaustive
        // or throws on unknown types. If it can return a type not in the switch,
        // an error here is appropriate.
        throw new Error(`Unknown or unhandled ControlMessageType: ${messageType}`)
    }
  }

  export function serialize(msg: ControlMessage): FrozenByteBuffer {
    return msg.serialize()
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest

  describe('ControlMessage', () => {
    describe('Announce', () => {
      function buildTestAnnounce(): Announce {
        return new Announce(12345n, Tuple.fromUtf8Path('god/dayyum'), [
          KeyValuePair.tryNewVarInt(0, 10),
          KeyValuePair.tryNewBytes(1, new TextEncoder().encode('wololoo')),
        ])
      }

      test('should roundtrip Announce correctly', () => {
        const announce = buildTestAnnounce()
        const serialized = ControlMessage.serialize(announce)
        const deserialized = ControlMessage.deserialize(serialized)
        expect(deserialized).toEqual(announce)
      })

      test('should roundtrip Announce with excess trailing bytes', () => {
        const announce = buildTestAnnounce()
        const serialized = ControlMessage.serialize(announce).toUint8Array()
        const excessBytes = new Uint8Array(serialized.length + 3)
        excessBytes.set(serialized)
        excessBytes.set([9, 1, 1], serialized.length)

        const buf = new FrozenByteBuffer(excessBytes)
        const deserialized = ControlMessage.deserialize(buf)
        expect(deserialized).toEqual(announce)
        expect(buf.remaining).toBe(3) // Check that excess bytes are still there
        expect(Array.from(buf.getBytes(3))).toEqual([9, 1, 1])
      })

      test('should throw on partial Announce message', () => {
        const announce = buildTestAnnounce()
        const serialized = ControlMessage.serialize(announce).toUint8Array()
        const partial = serialized.slice(0, Math.floor(serialized.length / 2))
        const buf = new FrozenByteBuffer(partial)
        expect(() => ControlMessage.deserialize(buf)).toThrow(NotEnoughBytesError)
      })
    })

    describe('Fetch', () => {
      function buildTestFetch(): Fetch {
        const requestId = 161803n
        const subscriberPriority = 15
        const groupOrder = GroupOrder.Descending
        const joiningRequestId = 119n
        const joiningStart = 73n
        const type = FetchType.Relative
        const parameters = [
          KeyValuePair.tryNewVarInt(4444, 12321n),
          KeyValuePair.tryNewBytes(1, new TextEncoder().encode('fetch me ok')),
        ]
        return new Fetch(
          requestId,
          subscriberPriority,
          groupOrder,
          { type, props: { joiningRequestId, joiningStart } },
          parameters,
        )
      }

      test('should roundtrip Fetch correctly', () => {
        const fetchMsg = buildTestFetch()
        const serialized = ControlMessage.serialize(fetchMsg)
        const deserialized = ControlMessage.deserialize(serialized)
        expect(deserialized).toEqual(fetchMsg)
      })

      test('should roundtrip Fetch with excess trailing bytes', () => {
        const fetchMsg = buildTestFetch()
        const serialized = ControlMessage.serialize(fetchMsg).toUint8Array()
        const excessBytes = new Uint8Array(serialized.length + 3)
        excessBytes.set(serialized)
        excessBytes.set([8, 2, 2], serialized.length)

        const buf = new FrozenByteBuffer(excessBytes)
        const deserialized = ControlMessage.deserialize(buf)
        expect(deserialized).toEqual(fetchMsg)
        expect(buf.remaining).toBe(3)
        expect(Array.from(buf.getBytes(3))).toEqual([8, 2, 2])
      })

      test('should throw on partial Fetch message', () => {
        const fetchMsg = buildTestFetch()
        const serialized = ControlMessage.serialize(fetchMsg).toUint8Array()
        const partial = serialized.slice(0, Math.floor(serialized.length / 2))
        const buf = new FrozenByteBuffer(partial)
        expect(() => ControlMessage.deserialize(buf)).toThrow(NotEnoughBytesError)
      })
    })
  })
}
