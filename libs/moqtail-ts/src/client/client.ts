import { ControlStream } from './control_stream'
export interface Logger {
  info(msg: string): void
  warn(msg: string): void
  error(msg: string): void
}
import {
  Announce,
  ClientSetup,
  ControlMessage,
  Fetch,
  FetchCancel,
  FetchError,
  FetchType,
  GoAway,
  ServerSetup,
  Subscribe,
  SubscribeAnnounces,
  SubscribeError,
  SubscribeUpdate,
  TrackStatusRequest as TrackStatusRequestMessage,
  Unannounce,
  Unsubscribe,
  UnsubscribeAnnounces,
} from '../model/control'
import {
  FetchHeader,
  FetchObject,
  FullTrackName,
  MoqtObject,
  SubgroupHeader,
  SubgroupHeaderType,
  SubgroupObject,
  TrackAliasMap,
} from '../model/data'
import { RecvStream } from './data_stream'
import { ProtocolViolationError, Tuple } from '../model'
import { AnnounceCancel } from '../model/control/announce_cancel'
import { Track } from './track/track'
import { AnnounceRequest } from './request/announce'
import { SubscribeAnnouncesRequest } from './request/subscribe_announces'
import { FetchRequest } from './request/fetch'
import { SubscribeRequest } from './request/subscribe'
import { TrackStatusRequest } from './request/track_status_request'
import { getHandlerForControlMessage } from './handler/handler'
import { SubscribePublication } from './publication/subscribe'
import { FetchPublication } from './publication/fetch'

export type MoqtailRequest =
  | AnnounceRequest
  | SubscribeAnnouncesRequest
  | FetchRequest
  | SubscribeRequest
  | TrackStatusRequest

export class MoqtailClient {
  public logger?: Logger
  public readonly peerSubscribeAnnounces = new Set<Tuple>() // Set of namepace prefixes peer subscribes upon.
  public readonly subscribedAnnounces = new Set<Tuple>() // Set of namespace prefixes this client subscribes to
  public readonly announcedNamespaces = new Set<Tuple>() // Q: Set is inefficient for prefix matching. Consider Trie
  public readonly trackSources: Map<string, Track> = new Map()
  public readonly requests: Map<bigint, MoqtailRequest> = new Map()
  public readonly publications: Map<bigint, SubscribePublication | FetchPublication> = new Map()
  private readonly subscriptions: Map<bigint, SubscribeRequest> = new Map() // Track Alias to Subscribe Request
  public readonly trackAliasMap: TrackAliasMap = new TrackAliasMap()
  public _serverSetup!: ServerSetup
  public controlStream!: ControlStream
  public maxRequestId?: bigint
  public dataStreamTimeoutMs?: number
  public controlStreamTimeoutMs?: number

  public onTrackAnnounced?: (msg: Announce) => void
  public onTrackUnannounced?: (msg: Unannounce) => void
  public onGoaway?: (msg: GoAway) => void
  public onWebTransportFail?: () => void
  public onSessionTerminated?: () => void
  public onMessageSent?: (msg: ControlMessage) => void
  public onMessageReceived?: (msg: ControlMessage) => void
  public onDataReceived?: (data: SubgroupObject | SubgroupHeader | FetchObject | FetchHeader) => void
  public onDataSent?: (data: SubgroupObject | SubgroupHeader | FetchObject | FetchHeader) => void
  private _requestIdGen = this._requestIdGenerator()

  //TODO: The id should start with 0, relay returns 1 so for quick fix we just put 1 instead
  private *_requestIdGenerator(): Generator<bigint, never, unknown> {
    let id: bigint = 0n
    while (true) {
      yield id
      id += 2n
    }
  }
  public get nextClientRequestId(): bigint {
    return this._requestIdGen.next().value
  }

  // TODO: Support URL construction
  private constructor(public readonly webTransport: WebTransport) {}

  static async new(
    clientSetup: ClientSetup,
    webTransport: WebTransport,
    options?: {
      dataStreamTimeoutMs?: number
      controlStreamTimeoutMs?: number
      logger?: Logger
      onMsgRecv?: (msg: ControlMessage) => void
      onMsgSent?: (msg: ControlMessage) => void
    },
  ): Promise<MoqtailClient> {
    const client = new MoqtailClient(webTransport)
    if (options?.onMsgRecv) client.onMessageReceived = options?.onMsgRecv
    if (options?.onMsgSent) client.onMessageSent = options?.onMsgSent
    if (options?.dataStreamTimeoutMs) client.dataStreamTimeoutMs = options.dataStreamTimeoutMs
    if (options?.controlStreamTimeoutMs) client.controlStreamTimeoutMs = options.controlStreamTimeoutMs
    if (options?.logger) client.logger = options.logger
    const biStream = await webTransport.createBidirectionalStream()
    client.controlStream = ControlStream.new(
      biStream,
      client.controlStreamTimeoutMs,
      client.onMessageSent,
      client.onMessageReceived,
    )
    client.controlStream.send(clientSetup)
    const reader = client.controlStream.stream.getReader()
    const { value: response, done } = await reader.read()
    if (done) throw new ProtocolViolationError('MoqtailClient.new', 'Stream closed after client setup')
    if (response instanceof ServerSetup) {
      client._serverSetup = response
      reader.releaseLock()
      client._handleIncomingControlMessages()
      client._acceptIncomingUniStreams()
      return client
    }
    throw new ProtocolViolationError('MoqtailClient.new', 'Expected server setup after client setup')
  }

  async disconnect() {
    // TODO: Session cleanup?
    if (!this.webTransport.closed) this.webTransport.close()
    if (this.onSessionTerminated) this.onSessionTerminated()
  }

  addOrUpdateTrack(track: Track) {
    this.trackSources.set(track.fullTrackName.toString(), track)
  }

  removeTrack(track: Track) {
    this.trackSources.delete(track.fullTrackName.toString())
  }

  async subscribe(msg: Subscribe): Promise<SubscribeError | ReadableStream<MoqtObject>> {
    try {
      const request = new SubscribeRequest(msg.requestId, msg)
      await this.controlStream.send(msg)
      this.logger?.info(`[CLIENT] Sent Subscribe: ${JSON.stringify(msg)}`)
      this.requests.set(request.requestId, request)
      this.subscriptions.set(msg.trackAlias, request)
      this.trackAliasMap.addMapping(Number(request.message.trackAlias), request.message.fullTrackName)
      const response = await request
      if (response instanceof SubscribeError) {
        console.warn('MoqtailClient.subscribe', 'Received SubscribeError', response)
        return response
      } else {
        console.warn('MoqtailClient.subscribe', 'Subscribe successful, returning stream', response)
        this.logger?.info(`[CLIENT] Subscribe successful: ${JSON.stringify(msg)}`)
        return request.stream
      }
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }
  async unsubscribe(requestId: bigint) {
    try {
      if (this.requests.has(requestId)) {
        const request = this.requests.get(requestId)!
        if (request instanceof Subscribe) {
          // TODO: Unsubscribe, mark data streams for closure
          this.controlStream.send(new Unsubscribe(requestId))
        }
      }
      // Q: Throw? Idempotent?
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async subscribeUpdate(msg: SubscribeUpdate) {
    try {
      if (this.requests.has(msg.requestId)) {
        const request = this.requests.get(msg.requestId)!
        if (request instanceof Subscribe) {
          // Q: Is there any operation needs to be done?
          this.controlStream.send(msg)
        }
      }
      // Q: Throw? Idempotent?
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async fetch(msg: Fetch) {
    try {
      const request = new FetchRequest(msg.requestId, msg)
      this.controlStream.send(msg)
      const response = await request
      if (response instanceof FetchError) {
        return response
      } else {
        return request.stream
      }
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async fetchCancel(msg: FetchCancel) {
    try {
      if (this.requests.has(msg.requestId)) {
        const request = this.requests.get(msg.requestId)!
        if (request instanceof Fetch) {
          // TODO: Fetch cancel, mark data streams for closure
          this.controlStream.send(new Unsubscribe(msg.requestId))
        }
      }
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async trackStatusRequest(msg: TrackStatusRequestMessage) {
    try {
      const request = new TrackStatusRequest(msg.requestId, msg)
      this.controlStream.send(msg)
      return await request
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  // TODO: Each announced track should checked against ongoing subscribe_announces
  // If matches it should send an announce to that peer automatically
  async announce(msg: Announce) {
    try {
      const request = new AnnounceRequest(msg.requestId, msg)
      this.requests.set(request.requestId, request)
      this.announcedNamespaces.add(msg.trackNamespace)
      this.controlStream.send(msg)
      return await request
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async unannounce(msg: Unannounce) {
    try {
      this.announcedNamespaces.delete(msg.trackNamespace)
      await this.controlStream.send(msg)
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async announceCancel(msg: AnnounceCancel) {
    try {
      await this.controlStream.send(msg)
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  // INFO: Subscriber calls this the get matching announce messages with this prefix
  async subscribeAnnounces(msg: SubscribeAnnounces) {
    try {
      await this.controlStream.send(msg)
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async unsubscribeAnnounces(msg: UnsubscribeAnnounces) {
    try {
      await this.controlStream.send(msg)
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  private async _handleIncomingControlMessages(): Promise<void> {
    try {
      const reader = this.controlStream.stream.getReader()
      while (true) {
        const { done, value: msg } = await reader.read()
        if (done) {
          // WebTransport session is terminated. Could be result of goaway
          // TODO: Terminate client
          break
        }
        const handler = getHandlerForControlMessage(msg)
        if (handler) {
          await handler(this, msg)
        } else {
          throw new ProtocolViolationError('MoqtailClient', 'No handler for the received message')
        }
      }
    } catch (error) {
      this.disconnect()
      throw error
    }
  }

  private async _acceptIncomingUniStreams(): Promise<void> {
    let streamCount = 0
    try {
      const uds = this.webTransport.incomingUnidirectionalStreams
      const reader = uds.getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          // WebTransport session is terminated
          // console.log('_acceptIncomingUniStreams | WebTransport session is terminated')
          break
        }
        ++streamCount
        // TODO: report number of accepted streams.
        // console.log('_acceptIncomingUniStreams | streamCount: %d', streamCount)
        let uniStream = value as ReadableStream
        this._handleRecvStreams(uniStream)
      }
    } catch (error) {
      this.disconnect()
      throw error
    }
  }
  private async _handleRecvStreams(incomingUniStream: ReadableStream): Promise<void> {
    try {
      const recvStream = await RecvStream.new(incomingUniStream, this.dataStreamTimeoutMs)
      const header = recvStream.header
      const reader = recvStream.stream.getReader()

      if (header instanceof FetchHeader) {
        const request = this.requests.get(header.requestId)
        if (request && request instanceof FetchRequest) {
          let fullTrackName: FullTrackName
          switch (request.message.fetchType) {
            case FetchType.StandAlone:
              fullTrackName = request.message.standaloneFetchProps!.fullTrackName
              break
            case FetchType.Relative:
            case FetchType.Absolute: {
              const joiningSubscription = this.requests.get(request.message.joiningFetchProps!.joiningRequestId)
              if (joiningSubscription instanceof SubscribeRequest) {
                fullTrackName = joiningSubscription.message.fullTrackName
                break
              }
              throw new ProtocolViolationError(
                '_handleRecvStreams',
                'No active subscription for given joining request id',
              )
            }
            default:
              throw new ProtocolViolationError('_handleRecvStreams', 'Unknown fetchType')
          }

          try {
            while (true) {
              const { done, value: nextObject } = await reader.read()
              if (done) {
                // Cleanup
                this.requests.delete(request.requestId)
                request.controller?.close()
                break
              }
              if (nextObject) {
                if (nextObject instanceof FetchObject) {
                  // TODO: validate if it's a valid fetch object
                  const moqtObject = MoqtObject.fromFetchObject(nextObject, fullTrackName)
                  request.controller?.enqueue(moqtObject)
                  continue
                }
                throw new ProtocolViolationError('MoqtailClient', 'Received subgroup object after fetch header')
              }
            }
          } finally {
            reader.releaseLock()
          }
          return
        }
        throw new ProtocolViolationError('MoqtailClient', 'No request for received request id')
      } else {
        const subscription = this.subscriptions.get(header.trackAlias)
        if (subscription) {
          subscription.streamsAccepted++
          let firstObjectId: bigint | null = null

          while (true) {
            const { done, value: nextObject } = await reader.read()
            if (done) {
              break
            }
            if (nextObject) {
              if (nextObject instanceof SubgroupObject) {
                // TODO: validate if it's a valid subgroup object
                if (!firstObjectId) {
                  firstObjectId = nextObject.objectId
                }
                let subgroupId = header.subgroupId
                switch (header.headerType) {
                  case SubgroupHeaderType.Type0x08:
                  case SubgroupHeaderType.Type0x09:
                    subgroupId = 0n
                    break
                  case SubgroupHeaderType.Type0x0A:
                  case SubgroupHeaderType.Type0x0B:
                    subgroupId = firstObjectId
                    break
                  case SubgroupHeaderType.Type0x0C:
                  case SubgroupHeaderType.Type0x0D:
                    subgroupId = header.subgroupId!
                }

                const moqtObject = MoqtObject.fromSubgroupObject(
                  nextObject,
                  header.groupId,
                  header.publisherPriority,
                  subgroupId,
                  this.trackAliasMap.getNameByAlias(Number(header.trackAlias)),
                )
                subscription.controller?.enqueue(moqtObject)
                continue
              }
              throw new ProtocolViolationError('MoqtailClient', 'Received fetch object after subgroup header')
            }
          }

          if (subscription.expectedStreams && subscription.expectedStreams === subscription.streamsAccepted) {
            subscription.controller?.close()
            this.subscriptions.delete(subscription.message.trackAlias)
            this.requests.delete(subscription.requestId)
          }
          return
        }
        throw new ProtocolViolationError('MoqtailClient', 'No subscription for received track alias')
      }
    } catch (error) {
      this.disconnect()
      throw error
    }
  }
}
