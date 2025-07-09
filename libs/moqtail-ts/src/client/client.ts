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
  FilterType,
  GoAway,
  GroupOrder,
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
import {
  InternalError,
  Location,
  MoqtailError,
  ProtocolViolationError,
  Tuple,
  VersionSpecificParameters,
} from '../model'
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
import { random60bitId } from './util/random_id'

export type MoqtailRequest =
  | AnnounceRequest
  | SubscribeAnnouncesRequest
  | FetchRequest
  | SubscribeRequest
  | TrackStatusRequest

export class MoqtailClient {
  readonly peerSubscribeAnnounces = new Set<Tuple>() // Set of namepace prefixes peer subscribes upon.
  readonly subscribedAnnounces = new Set<Tuple>() // Set of namespace prefixes this client subscribes to
  readonly announcedNamespaces = new Set<Tuple>() // Q: Set is inefficient for prefix matching. Consider Trie
  readonly trackSources: Map<string, Track> = new Map()
  readonly requests: Map<bigint, MoqtailRequest> = new Map()
  readonly publications: Map<bigint, SubscribePublication | FetchPublication> = new Map()
  readonly subscriptions: Map<bigint, SubscribeRequest> = new Map() // Track Alias to Subscribe Request
  readonly trackAliasMap: TrackAliasMap = new TrackAliasMap()
  _serverSetup!: ServerSetup
  controlStream!: ControlStream
  dataStreamTimeoutMs?: number
  controlStreamTimeoutMs?: number
  maxRequestId?: bigint
  logger?: Logger

  onTrackAnnounced?: (msg: Announce) => void
  onTrackUnannounced?: (msg: Unannounce) => void
  onGoaway?: (msg: GoAway) => void
  onWebTransportFail?: () => void
  onSessionTerminated?: () => void
  onMessageSent?: (msg: ControlMessage) => void
  onMessageReceived?: (msg: ControlMessage) => void
  onDataReceived?: (data: SubgroupObject | SubgroupHeader | FetchObject | FetchHeader) => void
  onDataSent?: (data: SubgroupObject | SubgroupHeader | FetchObject | FetchHeader) => void

  #isDestroyed = false
  #dontUseRequestId: bigint = 0n
  get #nextClientRequestId(): bigint {
    const id = this.#dontUseRequestId
    this.#dontUseRequestId += 2n
    return id
  }

  #ensureActive() {
    if (this.#isDestroyed) throw new MoqtailError('MoqtailClient is destroyed and cannot be used.')
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
      client.#handleIncomingControlMessages()
      client.#acceptIncomingUniStreams()
      return client
    }
    throw new ProtocolViolationError('MoqtailClient.new', 'Expected server setup after client setup')
  }

  async disconnect() {
    if (this.#isDestroyed) return
    this.#isDestroyed = true
    // TODO: Session cleanup?
    if (!this.webTransport.closed) this.webTransport.close()
    if (this.onSessionTerminated) this.onSessionTerminated()
  }

  addOrUpdateTrack(track: Track) {
    this.#ensureActive()
    this.trackSources.set(track.fullTrackName.toString(), track)
  }

  removeTrack(track: Track) {
    this.#ensureActive()
    this.trackSources.delete(track.fullTrackName.toString())
  }

  async subscribe(
    fullTrackName: FullTrackName,
    priority: number,
    groupOrder: GroupOrder,
    forward: boolean,
    filterType: FilterType,
    parameters: VersionSpecificParameters,
    trackAlias?: bigint,
    startLocation?: Location,
    endGroup?: bigint,
  ): Promise<SubscribeError | { requestId: bigint; stream: ReadableStream<MoqtObject> }> {
    this.#ensureActive()
    try {
      let msg: Subscribe
      if (!trackAlias) trackAlias = random60bitId()
      switch (filterType) {
        case FilterType.LatestObject:
          msg = Subscribe.newLatestObject(
            this.#nextClientRequestId,
            trackAlias,
            fullTrackName,
            priority,
            groupOrder,
            forward,
            parameters.build(),
          )
          break
        case FilterType.NextGroupStart:
          msg = Subscribe.newNextGroupStart(
            this.#nextClientRequestId,
            trackAlias,
            fullTrackName,
            priority,
            groupOrder,
            forward,
            parameters.build(),
          )
          break
        case FilterType.AbsoluteStart:
          if (!startLocation)
            throw new ProtocolViolationError(
              'MoqtailClient.subscribe',
              'FilterType.AbsoluteStart must have a start location',
            )
          msg = Subscribe.newAbsoluteStart(
            this.#nextClientRequestId,
            trackAlias,
            fullTrackName,
            priority,
            groupOrder,
            forward,
            startLocation,
            parameters.build(),
          )
          break
        case FilterType.AbsoluteRange:
          if (!startLocation || !endGroup)
            throw new ProtocolViolationError(
              'MoqtailClient.subscribe',
              'FilterType.AbsoluteRange must have a start location and an end group',
            )
          if (startLocation.group >= endGroup)
            throw new ProtocolViolationError('MoqtailClient.subscribe', 'End group must be greater than start group')

          msg = Subscribe.newAbsoluteRange(
            this.#nextClientRequestId,
            trackAlias,
            fullTrackName,
            priority,
            groupOrder,
            forward,
            startLocation,
            endGroup,
            parameters.build(),
          )
          break
      }
      const request = new SubscribeRequest(msg)
      this.requests.set(request.requestId, request)
      this.subscriptions.set(msg.trackAlias, request)
      this.trackAliasMap.addMapping(request.trackAlias, request.fullTrackName)
      await this.controlStream.send(msg)
      const response = await request
      if (response instanceof SubscribeError) {
        this.requests.delete(request.requestId)
        this.subscriptions.delete(msg.trackAlias)
        this.trackAliasMap.removeMappingByAlias(request.trackAlias)
        return response
      } else {
        return { requestId: msg.requestId, stream: request.stream }
      }
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async unsubscribe(requestId: bigint): Promise<void> {
    this.#ensureActive()
    try {
      if (this.requests.has(requestId)) {
        const request = this.requests.get(requestId)!
        if (request instanceof Subscribe) {
          const subscription = this.subscriptions.get(requestId)
          if (!subscription)
            throw new InternalError('MoqtailClient.unsubscribe', 'Request exists but subscription does not')
          await this.controlStream.send(new Unsubscribe(requestId))
          subscription.unsubscribe()
        }
      }
      // Q: Throw? Idempotent?
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async subscribeUpdate(
    requestId: bigint,
    startLocation: Location,
    endGroup: bigint,
    priority: number,
    forward: boolean,
    parameters: VersionSpecificParameters,
  ): Promise<void> {
    this.#ensureActive()
    if (startLocation.group >= endGroup)
      throw new ProtocolViolationError('MoqtailClient.subscribeUpdate', 'End group must be greater than start group')
    try {
      if (this.requests.has(requestId)) {
        const request = this.requests.get(requestId)!
        if (request instanceof Subscribe) {
          if (request.startLocation && request.startLocation.compare(startLocation) != 1)
            throw new ProtocolViolationError(
              'MoqtailClient.subscribeUpdate',
              'Subscriptions can only become more narrow, not wider.  The start location must not decrease',
            )
          if (request.endGroup && request.endGroup < endGroup)
            throw new ProtocolViolationError(
              'MoqtailClient.subscribeUpdate',
              'Subscriptions can only become more narrow, not wider. The end group must not increase',
            )
          const subscription = this.subscriptions.get(requestId)
          if (!subscription)
            throw new InternalError('MoqtailClient.subscribeUpdate', 'Request exists but subscription does not')
          // TODO: If a parameter included in SUBSCRIBE is not present in SUBSCRIBE_UPDATE, its value remains unchanged.
          // There is no mechanism to remove a parameter from a subscription. We can add parameters but check for duplicate params
          const msg = new SubscribeUpdate(requestId, startLocation, endGroup, priority, forward, parameters.build())
          subscription.update(msg) // This also updates the request since both maps store the same object
          await this.controlStream.send(msg)
        }
      }
      // Q: Throw? Idempotent?
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  // TODO: figure out how to handle joining fetch types
  // Do we need an existing subscription? What happens if that subscription forwards objects?
  // Will the subscribe objects be pushed through this FetchRequest.controller?
  async fetch(args: {
    subscriberPriority: number
    groupOrder: GroupOrder
    typeAndProps:
      | {
          type: FetchType.StandAlone
          props: { fullTrackName: FullTrackName; startLocation: Location; endLocation: Location }
        }
      | {
          type: FetchType.Relative
          props: { joiningRequestId: bigint; joiningStart: bigint }
        }
      | {
          type: FetchType.Absolute
          props: { joiningRequestId: bigint; joiningStart: bigint }
        }
    parameters?: VersionSpecificParameters
  }): Promise<FetchError | { requestId: bigint; stream: ReadableStream<MoqtObject> }> {
    this.#ensureActive()
    try {
      const { subscriberPriority, groupOrder, typeAndProps, parameters } = args
      if (subscriberPriority < 0 || subscriberPriority > 255)
        throw new ProtocolViolationError(
          'MoqtailClient.fetch',
          `subscriberPriority: ${subscriberPriority} must be in range of [0-255]`,
        )
      const params = parameters ? parameters.build() : new VersionSpecificParameters().build()
      let msg: Fetch
      let joiningRequest: MoqtailRequest | undefined
      switch (typeAndProps.type) {
        case FetchType.StandAlone:
          msg = new Fetch(
            this.#nextClientRequestId,
            subscriberPriority,
            groupOrder,
            { type: typeAndProps.type, props: typeAndProps.props },
            params,
          )
          break

        case FetchType.Relative:
          joiningRequest = this.requests.get(typeAndProps.props.joiningRequestId)
          if (!(joiningRequest instanceof SubscribeRequest))
            throw new ProtocolViolationError(
              'MoqtailClient.fetch',
              `No subscribe request for the given joiningRequestId: ${typeAndProps.props.joiningRequestId}`,
            )
          msg = new Fetch(
            this.#nextClientRequestId,
            subscriberPriority,
            groupOrder,
            { type: typeAndProps.type, props: typeAndProps.props },
            params,
          )
          break
        case FetchType.Absolute:
          joiningRequest = this.requests.get(typeAndProps.props.joiningRequestId)
          if (!(joiningRequest instanceof SubscribeRequest))
            throw new ProtocolViolationError(
              'MoqtailClient.fetch',
              `No subscribe request for the given joiningRequestId: ${typeAndProps.props.joiningRequestId}`,
            )
          msg = new Fetch(
            this.#nextClientRequestId,
            subscriberPriority,
            groupOrder,
            { type: typeAndProps.type, props: typeAndProps.props },
            params,
          )
          break
      }
      const request = new FetchRequest(msg)
      this.requests.set(msg.requestId, request)
      await this.controlStream.send(msg)
      const response = await request
      if (response instanceof FetchError) {
        this.requests.delete(msg.requestId)
        return response
      } else {
        const stream = request.stream
        return { requestId: msg.requestId, stream }
      }
    } catch (err) {
      await this.disconnect()
      throw err
    }
  }

  async fetchCancel(requestId: bigint | number) {
    this.#ensureActive()
    try {
      const request = this.requests.get(BigInt(requestId))
      if (request) {
        if (request instanceof Fetch) {
          // TODO: Fetch cancel, mark data streams for closure
          this.controlStream.send(new FetchCancel(requestId))
        }
      }
      // No matching fetch request, idempotent
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async trackStatusRequest(msg: TrackStatusRequestMessage) {
    this.#ensureActive()
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
    this.#ensureActive()
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
    this.#ensureActive()
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
    this.#ensureActive()
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
    this.#ensureActive()
    try {
      await this.controlStream.send(msg)
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async unsubscribeAnnounces(msg: UnsubscribeAnnounces) {
    this.#ensureActive()
    try {
      await this.controlStream.send(msg)
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  async #handleIncomingControlMessages(): Promise<void> {
    this.#ensureActive()
    try {
      const reader = this.controlStream.stream.getReader()
      while (true) {
        const { done, value: msg } = await reader.read()
        if (done) throw new MoqtailError('WebTransport session is terminated')
        const handler = getHandlerForControlMessage(msg)
        if (!handler) throw new ProtocolViolationError('MoqtailClient', 'No handler for the received message')
        await handler(this, msg)
      }
    } catch (error) {
      this.disconnect()
      throw error
    }
  }

  async #acceptIncomingUniStreams(): Promise<void> {
    this.#ensureActive()
    try {
      const uds = this.webTransport.incomingUnidirectionalStreams
      const reader = uds.getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) throw new MoqtailError('WebTransport session is terminated')
        let uniStream = value as ReadableStream
        this.#handleRecvStreams(uniStream)
      }
    } catch (error) {
      this.disconnect()
      throw error
    }
  }
  // TODO: Handle request cancellation. Cancel streams are expected to receive some on-fly objects.
  // Do a timeout? Wait for certain amount of objects?
  async #handleRecvStreams(incomingUniStream: ReadableStream): Promise<void> {
    this.#ensureActive()
    try {
      const recvStream = await RecvStream.new(incomingUniStream, this.dataStreamTimeoutMs)
      const header = recvStream.header
      const reader = recvStream.stream.getReader()

      if (header instanceof FetchHeader) {
        const request = this.requests.get(header.requestId)
        if (request && request instanceof FetchRequest) {
          let fullTrackName: FullTrackName
          switch (request.message.typeAndProps.type) {
            case FetchType.StandAlone:
              fullTrackName = request.message.typeAndProps.props.fullTrackName
              break
            case FetchType.Relative:
            case FetchType.Absolute: {
              const joiningSubscription = this.requests.get(request.message.typeAndProps.props.joiningRequestId)
              if (joiningSubscription instanceof SubscribeRequest) {
                fullTrackName = joiningSubscription.fullTrackName
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
                // Fetch Cleanup
                this.requests.delete(request.requestId)
                request.controller?.close()
                break
              }
              if (nextObject) {
                if (nextObject instanceof FetchObject) {
                  // TODO: validate if it's a valid fetch object, asc or desc?
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
                  this.trackAliasMap.getNameByAlias(header.trackAlias),
                )
                if (!subscription.largestLocation) subscription.largestLocation = moqtObject.location
                if (subscription.largestLocation.compare(moqtObject.location) == -1)
                  subscription.largestLocation = moqtObject.location

                subscription.controller?.enqueue(moqtObject)
                continue
              }
              throw new ProtocolViolationError('MoqtailClient', 'Received fetch object after subgroup header')
            }
          }

          // Subscribe Cleanup
          if (subscription.expectedStreams && subscription.expectedStreams === subscription.streamsAccepted) {
            subscription.controller?.close()
            this.subscriptions.delete(subscription.trackAlias)
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
