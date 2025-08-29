import { ControlStream } from './control_stream'
import {
  Announce,
  AnnounceError,
  AnnounceOk,
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
  MoqtailError,
  ProtocolViolationError,
  SetupParameters,
  Tuple,
  VersionSpecificParameters,
} from '../model'
import { AnnounceCancel } from '../model/control/announce_cancel'
import { Track } from './track/track'
import { AnnounceRequest } from './request/announce'
import { FetchRequest } from './request/fetch'
import { SubscribeRequest } from './request/subscribe'
import { TrackStatusRequest } from './request/track_status_request'
import { getHandlerForControlMessage } from './handler/handler'
import { SubscribePublication } from './publication/subscribe'
import { FetchPublication } from './publication/fetch'
import { random60bitId } from './util/random_id'
import { MoqtailRequest, SubscribeOptions, SubscribeUpdateOptions, FetchOptions, MoqtailClientOptions } from './types'

/**
 * Represents a Media Over QUIC Transport (MOQT) client session.
 *
 * Use {@link MoqtailClient.new} to establish a connection and perform MOQT operations such as subscribing to tracks,
 * fetching historical data, announcing tracks for publication, and managing session lifecycle.
 *
 * Once initialized, the client provides high-level methods for MOQT requests and publishing. If a protocol violation
 * occurs, the client will terminate and must be re-initialized.
 *
 * ## Usage
 *
 * ### Connect and Subscribe to a Track
 * ```ts
 * const client = await MoqtailClient.new({ url, supportedVersions: [0xff00000b] });
 * const result = await client.subscribe({
 *   fullTrackName,
 *   filterType: FilterType.LatestObject,
 *   forward: true,
 *   groupOrder: GroupOrder.Original,
 *   priority: 0
 * });
 * if (!(result instanceof SubscribeError)) {
 *   for await (const object of result.stream) {
 *     // Consume MOQT objects
 *   }
 * }
 * ```
 *
 * ### Announce a Track for Publishing
 * ```ts
 * const client = await MoqtailClient.new({ url, supportedVersions: [0xff00000b] });
 * const announceResult = await client.announce(["camera", "main"]);
 * if (!(announceResult instanceof AnnounceError)) {
 *   // Ready to publish objects under this namespace
 * }
 * ```
 *
 * ### Graceful Shutdown
 * ```ts
 * await client.disconnect();
 * ```
 */
export class MoqtailClient {
  /**
   * Namespace prefixes (tuples) the peer has requested announce notifications for via SUBSCRIBE_ANNOUNCES.
   * Used to decide which locally issued ANNOUNCE messages should be forwarded (future optimization: prefix trie).
   */
  readonly peerSubscribeAnnounces = new Set<Tuple>()
  /**
   * Namespace prefixes this client has subscribed to (issued SUBSCRIBE_ANNOUNCES). Enables automatic filtering
   * of incoming ANNOUNCE / UNANNOUNCE. Maintained locally; no dedupe of overlapping / shadowing prefixes yet.
   */
  readonly subscribedAnnounces = new Set<Tuple>()
  /**
   * Track namespaces this client has successfully announced (received ANNOUNCE_OK). Source of truth for
   * deciding what to UNANNOUNCE on teardown or targeted withdrawal.(future optimization: prefix trie).
   */
  readonly announcedNamespaces = new Set<Tuple>()
  /**
   * Locally registered track definitions keyed by full track name string. Populated via addOrUpdateTrack.
   * Does not imply the track has been announced or has active publications.
   */
  readonly trackSources: Map<string, Track> = new Map()
  /**
   * All in‑flight request objects keyed by requestId (SUBSCRIBE, FETCH, ANNOUNCE, etc). Facilitates lookup
   * when responses / data arrive. Entries are removed on completion or error.
   */
  readonly requests: Map<bigint, MoqtailRequest> = new Map()
  /**
   * Active publications (SUBSCRIBE or FETCH) keyed by requestId to manage object stream controllers and lifecycle.
   * Subset / specialization view of `requests`.
   */
  readonly publications: Map<bigint, SubscribePublication | FetchPublication> = new Map()
  /**
   * Active SUBSCRIBE request wrappers keyed by track alias for rapid alias -> subscription resolution during
   * incoming unidirectional data handling.
   */
  readonly subscriptions: Map<bigint, SubscribeRequest> = new Map()
  /**
   * Bidirectional alias <-> full track name mapping to reconstruct metadata for incoming objects that reference aliases only.
   */
  readonly trackAliasMap: TrackAliasMap = new TrackAliasMap()
  /** Underlying WebTransport session (set after successful construction in MoqtailClient.new). */
  webTransport!: WebTransport
  /** Validated ServerSetup message captured during handshake (protocol parameters negotiated). */
  #serverSetup!: ServerSetup
  /** Outgoing / incoming control message bidirectional stream wrapper. */
  controlStream!: ControlStream
  /** Timeout (ms) applied to reading incoming data streams; undefined => no explicit timeout. */
  dataStreamTimeoutMs?: number
  /** Timeout (ms) for control stream read operations; undefined => no explicit timeout. */
  controlStreamTimeoutMs?: number
  /** Optional highest request id allowed (enforced externally / via configuration). */
  maxRequestId?: bigint

  /** Flag indicating the client has been disconnected/destroyed and cannot accept further API calls. */
  #isDestroyed = false
  /** Internal monotonically increasing client-assigned request id counter (even/odd parity scheme advances by 2). */
  #dontUseRequestId: bigint = 0n

  /**
   * Fired when an ANNOUNCE control message is processed for a track namespace.
   * Use to update UI or trigger discovery logic.
   * Discovery event.
   */
  onTrackAnnounced?: (msg: Announce) => void

  /**
   * Fired when an UNANNOUNCE control message is processed for a namespace.
   * Use to remove tracks from UI or stop discovery.
   * Discovery event.
   */
  onTrackUnannounced?: (msg: Unannounce) => void

  /**
   * Fired on GOAWAY reception signaling graceful session wind-down.
   * Use to prepare for disconnect or cleanup.
   * Lifecycle handler.
   */
  onGoaway?: (msg: GoAway) => void

  /**
   * Fired if the underlying WebTransport session fails (ready → closed prematurely).
   * Use to log or alert on transport errors.
   * Lifecycle/error handler.
   */
  onWebTransportFail?: () => void

  /**
   * Fired exactly once when the client transitions to terminated (disconnect).
   * Use to clean up resources or notify user.
   * Lifecycle handler.
   */
  onSessionTerminated?: (reason?: unknown) => void

  /**
   * Invoked after each outbound control message is sent.
   * Use for logging or analytics.
   * Informational event.
   */
  onMessageSent?: (msg: ControlMessage) => void

  /**
   * Invoked upon receiving each inbound control message before handling.
   * Use for logging or debugging.
   * Informational event.
   */
  onMessageReceived?: (msg: ControlMessage) => void

  /**
   * Invoked for each decoded data object/header arriving on a uni stream (fetch or subgroup).
   * Use to process or display incoming media/data.
   * Informational event.
   */
  onDataReceived?: (data: SubgroupObject | SubgroupHeader | FetchObject | FetchHeader) => void

  /**
   * Invoked after enqueuing each outbound data object/header.
   * Reserved for future use.
   * Informational event.
   */
  onDataSent?: (data: SubgroupObject | SubgroupHeader | FetchObject | FetchHeader) => void

  /**
   * General-purpose error callback for surfaced exceptions not thrown to caller synchronously.
   * Use to log or display errors.
   * Error handler.
   */
  onError?: (er: unknown) => void
  // ...existing code...

  /**
   * Allocate the next client-originated request id using the even/odd stride pattern (increments by 2).
   * Ensures uniqueness within the session and leaves space for peer-assigned ids if parity strategy is employed.
   */
  get #nextClientRequestId(): bigint {
    const id = this.#dontUseRequestId
    this.#dontUseRequestId += 2n
    return id
  }

  /**
   * Gets the current server setup configuration.
   *
   * @returns The {@link ServerSetup} instance associated with this client.
   */
  get serverSetup(): ServerSetup {
    return this.#serverSetup
  }

  /**
   * Guard that throws if the client has been destroyed (disconnect already called). Used at start of public APIs
   * to fail fast rather than perform partial operations on a torn-down session.
   * @throws MoqtailError when #isDestroyed is true.
   */
  #ensureActive() {
    if (this.#isDestroyed) throw new MoqtailError('MoqtailClient is destroyed and cannot be used.')
  }

  private constructor() {}
  /**
   * @description
   * Establishes a new {@link MoqtailClient} session over WebTransport and performs the MOQT setup handshake.
   *
   * @param args {@link MoqtailClientOptions}:
   *   - `url`: Relay/server endpoint (string or URL).
   *   - `supportedVersions`: Array of protocol versions (number[]).
   *   - `setupParameters`: Optional {@link SetupParameters} for protocol negotiation.
   *   - `transportOptions`: Optional {@link https://developer.mozilla.org/docs/Web/API/WebTransportOptions | WebTransportOptions} for session configuration.
   *   - `dataStreamTimeoutMs`: Optional timeout (ms) for data streams.
   *   - `controlStreamTimeoutMs`: Optional timeout (ms) for control streams.
   *   - `callbacks`: Optional hooks for logging and lifecycle events.
   *
   * @returns Promise resolving to a ready {@link MoqtailClient} instance.
   *
   * @throws: {@link ProtocolViolationError} If the server sends an unexpected or invalid message during setup.
   *
   * @example Minimal connection
   * ```ts
   * const client = await MoqtailClient.new({
   *   url: 'https://relay.example.com/transport',
   *   supportedVersions: [0xff00000b]
   * });
   * ```
   *
   * @example With callbacks and options
   * ```ts
   * const client = await MoqtailClient.new({
   *   url,
   *   supportedVersions: [0xff00000b],
   *   setupParameters: new SetupParameters().addMaxRequestId(1000),
   *   transportOptions: { congestionControl: 'default' },
   *   dataStreamTimeoutMs: 5000,
   *   controlStreamTimeoutMs: 2000,
   *   callbacks: {
   *     onMessageSent: msg => console.log('Sent:', msg),
   *     onMessageReceived: msg => console.log('Received:', msg),
   *     onSessionTerminated: reason => console.warn('Session ended:', reason)
   *   }
   * });
   * ```
   */
  static async new(args: MoqtailClientOptions): Promise<MoqtailClient> {
    const {
      url,
      supportedVersions,
      setupParameters,
      transportOptions,
      dataStreamTimeoutMs,
      controlStreamTimeoutMs,
      callbacks,
    } = args
    const client = new MoqtailClient()

    client.webTransport = new WebTransport(url, transportOptions)
    await client.webTransport.ready
    try {
      if (callbacks?.onMessageSent) client.onMessageSent = callbacks.onMessageSent
      if (callbacks?.onMessageReceived) client.onMessageReceived = callbacks.onMessageReceived
      if (callbacks?.onSessionTerminated) client.onSessionTerminated = callbacks.onSessionTerminated
      if (dataStreamTimeoutMs) client.dataStreamTimeoutMs = dataStreamTimeoutMs
      if (controlStreamTimeoutMs) client.controlStreamTimeoutMs = controlStreamTimeoutMs

      // Control stream should have the highest priority
      const biStream = await client.webTransport.createBidirectionalStream({ sendOrder: Number.MAX_SAFE_INTEGER })
      client.controlStream = ControlStream.new(
        biStream,
        client.controlStreamTimeoutMs,
        client.onMessageSent,
        client.onMessageReceived,
      )
      const params = setupParameters ? setupParameters.build() : new SetupParameters().build()
      const clientSetup = new ClientSetup(supportedVersions, params)
      client.controlStream.send(clientSetup)
      const reader = client.controlStream.stream.getReader()
      const { value: response, done } = await reader.read()
      if (done) throw new ProtocolViolationError('MoqtailClient.new', 'Stream closed after client setup')
      if (!(response instanceof ServerSetup))
        throw new ProtocolViolationError('MoqtailClient.new', 'Expected server setup after client setup')
      client.#serverSetup = response
      reader.releaseLock()
      client.#handleIncomingControlMessages()
      client.#acceptIncomingUniStreams()
      return client
    } catch (error) {
      await client.disconnect(
        new InternalError('MoqtailClient.new', error instanceof Error ? error.message : String(error)),
      )
      throw error
    }
  }

  /**
   * @description
   * Gracefully terminates this {@link MoqtailClient} session and releases underlying {@link https://developer.mozilla.org/docs/Web/API/WebTransport | WebTransport} resources.
   *
   * @param reason Optional application-level reason (string or error) recorded and wrapped in an {@link InternalError}
   * passed to the {@link MoqtailClient.onSessionTerminated | onSessionTerminated} callback.
   *
   * @returns Promise that resolves once shutdown logic completes. Subsequent calls are safe no-ops.
   *
   * @example
   * // Basic usage
   * await client.disconnect();
   *
   * @example
   * // With reason
   * await client.disconnect('user logout');
   *
   * @example
   * // Idempotent double call
   * await client.disconnect();
   * await client.disconnect(); // no error
   *
   * @example
   * // Page unload safety
   * window.addEventListener('beforeunload', () => {
   *   client.disconnect('page unload');
   * });
   */
  async disconnect(reason?: unknown) {
    console.log('disconnect', reason)
    if (this.#isDestroyed) return
    this.#isDestroyed = true
    // TODO: Session cleanup?
    if (!this.webTransport.closed) this.webTransport.close()
    if (this.onSessionTerminated)
      this.onSessionTerminated(
        new InternalError('MoqtailClient.disconnect', reason instanceof Error ? reason.message : String(reason)),
      )
  }

  /**
   * @description
   * Registers or updates a {@link Track} definition for local publishing or serving.
   *
   * A {@link Track} describes a logical media/data stream, identified by a unique name and namespace.
   * - If `trackSource.live` is present, the track can be served to subscribers in real-time.
   * - If `trackSource.past` is present, the track can be fetched for historical data.
   * - If both are present, the track supports both live and historical access.
   *
   * @param track The {@link Track} instance to add or update. See {@link TrackSource} for live/past source options.
   * @returns void
   * @throws: {@link MoqtailError} If the client has been destroyed.
   *
   * @example
   * ```ts
   * // Create a live video track from getUserMedia
   * const stream = await navigator.mediaDevices.getUserMedia({ video: true });
   * const videoTrack = stream.getVideoTracks()[0];
   *
   * // Convert video frames to MoqtObject instances using your chosen scheme (e.g. WARP, CMAF, etc.)
   * // This part is application-specific and not provided by moqtail:
   * const liveReadableStream: ReadableStream<MoqtObject> = ...
   *
   * // Register the track for live subscription
   * client.addOrUpdateTrack({
   *   fullTrackName: { namespace: ["camera"], name: "main" },
   *   forwardingPreference: ObjectForwardingPreference.Latest,
   *   trackSource: { live: liveReadableStream },
   *   publisherPriority: 0 // highest priority
   * });
   *
   * // For a hybrid track (live + past):
   * import { MemoryObjectCache } from './track/object_cache';
   * const cache = new MemoryObjectCache(); // Caches are not yet fully supported
   * client.addOrUpdateTrack({
   *   fullTrackName: { namespace: ["camera"], name: "main" },
   *   forwardingPreference: ObjectForwardingPreference.Latest,
   *   trackSource: { live: liveReadableStream, past: cache },
   *   publisherPriority: 8
   * });
   * ```
   */
  addOrUpdateTrack(track: Track) {
    this.#ensureActive()
    this.trackSources.set(track.fullTrackName.toString(), track)
  }

  /**
   * @description
   * Removes a previously registered {@link Track} from this client's local catalog.
   *
   * This deletes the in-memory entry inserted via {@link addOrUpdateTrack}, so future lookups by its {@link Track.fullTrackName} will fail.
   * Does **not** automatically:
   * - Send an {@link Unannounce} (call {@link unannounce} separately if you want to inform peers)
   * - Cancel active subscriptions or fetches (they continue until normal completion)
   * - Affect already-sent objects.
   *
   * If the track was not present, the call is a silent no-op (idempotent removal).
   *
   * @param track The exact {@link Track} instance (its canonical name is used as the key).
   * @throws: {@link MoqtailError} If the client has been destroyed.
   *
   * @example
   * ```ts
   * // Register a track
   * client.addOrUpdateTrack(track);
   *
   * // Later, when no longer publishing:
   * client.removeTrack(track);
   *
   * // Optionally, inform peers that the namespace is no longer available:
   * await client.unannounce(track.fullTrackName.namespace);
   * ```
   */
  removeTrack(track: Track) {
    this.#ensureActive()
    this.trackSources.delete(track.fullTrackName.toString())
  }

  /**
   * @description
   * Subscribes to a track and returns a stream of {@link MoqtObject}s matching the requested window and relay forwarding mode.
   *
   * - `forward: true` tells the relay to forward objects to this subscriber as they arrive.
   * - `forward: false` means the relay subscribes upstream but buffers objects locally, not forwarding them to you.
   * - `filterType: AbsoluteStart` lets you specify a start position in the future; the stream waits for that object. If the start location is < the latest object
   * observed at the publisher then it behaves as `filterType: LatestObject`
   * - `filterType: AbsoluteRange` lets you specify a start and end group, both of should be in the future; the stream waits for those objects. If the start location is < the latest object
   * observed at the publisher then it behaves as `filterType: LatestObject`.
   *
   * The method returns either a {@link SubscribeError} (on refusal) or an object with the subscription `requestId` and a `ReadableStream` of {@link MoqtObject}s.
   * Use the `requestId` for {@link unsubscribe} or {@link subscribeUpdate}. Use the `stream` to decode and display objects.
   *
   * @param args {@link SubscribeOptions} describing the subscription window and relay forwarding behavior.
   * @returns Either a {@link SubscribeError} or `{ requestId, stream }` for consuming objects.
   * @throws: {@link MoqtailError} If the client is destroyed.
   * @throws: {@link ProtocolViolationError} If required fields are missing or inconsistent.
   * @throws: {@link InternalError} On transport/protocol failure (disconnect is triggered before rethrow).
   *
   * @example
   * ```ts
   * // Subscribe to the latest object and receive future objects as they arrive
   * const result = await client.subscribe({
   *   fullTrackName,
   *   filterType: FilterType.LatestObject,
   *   forward: true,
   *   groupOrder: GroupOrder.Original,
   *   priority: 32
   * });
   * if (!(result instanceof SubscribeError)) {
   *   for await (const obj of result.stream) {
   *     // decode and display obj
   *   }
   * }
   * ```
   *
   * @example
   * ```ts
   * // Subscribe to a future range (waits for those objects to arrive)
   * const result = await client.subscribe({
   *   fullTrackName,
   *   filterType: FilterType.AbsoluteRange,
   *   startLocation: futureStart,
   *   endGroup: futureEnd,
   *   forward: true,
   *   groupOrder: GroupOrder.Original,
   *   priority: 128
   * });
   * ```
   */
  async subscribe(
    args: SubscribeOptions,
  ): Promise<SubscribeError | { requestId: bigint; stream: ReadableStream<MoqtObject> }> {
    this.#ensureActive()
    try {
      let {
        fullTrackName,
        priority,
        groupOrder,
        forward,
        filterType,
        parameters,
        trackAlias,
        startLocation,
        endGroup,
      } = args

      let msg: Subscribe
      if (typeof endGroup === 'number') endGroup = BigInt(endGroup)
      if (typeof trackAlias === 'number') trackAlias = BigInt(trackAlias)
      if (!trackAlias) trackAlias = random60bitId()
      if (!parameters) parameters = new VersionSpecificParameters()
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
    } catch (error) {
      await this.disconnect(
        new InternalError('MoqtailClient.subscribe', error instanceof Error ? error.message : String(error)),
      )
      throw error
    }
  }

  /**
   * @description
   * Stops an active subscription identified by its original SUBSCRIBE `requestId`.
   *
   * Sends an {@link Unsubscribe} control frame if the subscription is still active. If the id is unknown or already
   * cleaned up, the call is a silent no-op (hence multiple calls are idempotent).
   *
   * Use this when you no longer want incoming objects for a track (e.g. user navigated away, switching quality).
   * Canceling the consumer stream reader does **not** auto-unsubscribe; call this explicitly for prompt cleanup.
   *
   * @param requestId The id returned from {@link subscribe}.
   * @returns Promise that resolves when the unsubscribe control frame is sent.
   * @throws :{@link MoqtailError} If the client is destroyed.
   * @throws :{@link InternalError} Wrapped lower-level failure while attempting to send (session will be disconnected first).
   *
   * @remarks
   * - Only targets SUBSCRIBE requests, not fetches. Passing a fetch request id is ignored (no-op).
   * - Safe to call multiple times; extra calls have no effect.
   *
   * @example
   * ```ts
   * // Subscribe and later unsubscribe
   * const sub = await client.subscribe({ fullTrackName, filterType: FilterType.LatestObject, forward: true, groupOrder: GroupOrder.Original, priority: 0 });
   * if (!(sub instanceof SubscribeError)) {
   *   // ...consume objects...
   *   await client.unsubscribe(sub.requestId);
   * }
   * ```
   *
   * @example
   * ```ts
   * // Idempotent usage
   * await client.unsubscribe(123n);
   * await client.unsubscribe(123n); // no error
   * ```
   */
  async unsubscribe(requestId: bigint | number): Promise<void> {
    this.#ensureActive()
    if (typeof requestId === 'number') requestId = BigInt(requestId)
    let cleanupData: { requestId: bigint; trackAlias: bigint; subscription: SubscribeRequest } | null = null

    try {
      if (this.requests.has(requestId)) {
        const request = this.requests.get(requestId)!
        if (request instanceof SubscribeRequest) {
          const subscription = this.subscriptions.get(request.trackAlias)
          if (!subscription)
            throw new InternalError('MoqtailClient.unsubscribe', 'Request exists but subscription does not')

          cleanupData = { requestId, trackAlias: request.trackAlias, subscription }

          await this.controlStream.send(new Unsubscribe(requestId))
          subscription.unsubscribe()
        }
      }
      // Q: Throw? Idempotent?
    } catch (error) {
      await this.disconnect(
        new InternalError('MoqtailClient.unsubscribe', error instanceof Error ? error.message : String(error)),
      )
      throw error
    } finally {
      if (cleanupData) {
        this.requests.delete(cleanupData.requestId)
        this.subscriptions.delete(cleanupData.trackAlias)
        this.trackAliasMap.removeMappingByAlias(cleanupData.trackAlias)
      }
    }
  }

  /**
   * @description
   * Narrows or updates an active subscription window and/or relay forwarding behavior.
   *
   * Use this to:
   * - Move the start of the subscription forward (trim history or future window).
   * - Move the end group earlier (shorten the window).
   * - Change relay forwarding (`forward: false` stops forwarding new objects, `true` resumes).
   * - Adjust subscriber priority.
   *
   * Only narrowing is allowed: you cannot move the start earlier or the end group later than the original subscription.
   * Forwarding and priority can be changed at any time.
   *
   * @param args {@link SubscribeUpdateOptions} referencing the original subscription `requestId` and new bounds.
   * @returns Promise that resolves when the update control frame is sent.
   * @throws :{@link MoqtailError} If the client is destroyed.
   * @throws :{@link ProtocolViolationError} If the update would widen the window (earlier start, later end group, or invalid ordering).
   * @throws :{@link InternalError} On transport/control failure (disconnect is triggered before rethrow).
   *
   * @remarks
   * - Only applies to active SUBSCRIBE requests; ignored if the request is not a subscription.
   * - Omitting a parameter (e.g. `priority`) leaves the previous value unchanged.
   * - Setting `forward: false` stops relay forwarding new objects after the current window drains.
   * - Safe to call multiple times; extra calls with unchanged bounds have no effect.
   *
   * @example
   * ```ts
   * // Trim start forward
   * await client.subscribeUpdate({ requestId, startLocation: laterLoc, endGroup, forward: true, priority });
   *
   * // Convert tailing subscription into bounded slice
   * await client.subscribeUpdate({ requestId, startLocation: origStart, endGroup: cutoffGroup, forward: false, priority });
   *
   * // Lower priority only
   * await client.subscribeUpdate({ requestId, startLocation: currentStart, endGroup: currentEnd, forward: true, priority: 200 });
   * ```
   */
  async subscribeUpdate(args: SubscribeUpdateOptions): Promise<void> {
    this.#ensureActive()
    let { requestId, priority, forward, parameters, startLocation, endGroup } = args
    if (startLocation.group >= endGroup)
      throw new ProtocolViolationError('MoqtailClient.subscribeUpdate', 'End group must be greater than start group')
    try {
      if (this.requests.has(requestId)) {
        const request = this.requests.get(requestId)!
        if (request instanceof SubscribeRequest) {
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
          if (!parameters) parameters = new VersionSpecificParameters()
          const msg = new SubscribeUpdate(requestId, startLocation, endGroup, priority, forward, parameters.build())
          subscription.update(msg) // This also updates the request since both maps store the same object
          await this.controlStream.send(msg)
        }
      }
      // Q: Throw? Idempotent?
    } catch (error) {
      await this.disconnect(
        new InternalError('MoqtailClient.subscribeUpdate', error instanceof Error ? error.message : String(error)),
      )
      throw error
    }
  }

  /**
   * One-shot retrieval of a bounded object span, optionally anchored to an existing subscription, returning a stream of {@link MoqtObject}s.
   *
   * Choose a fetch type via `typeAndProps.type`:
   * - StandAlone: Historical slice of a specific {@link FullTrackName} independent of active subscriptions.
   * - Relative: Range relative to the JOINING subscription's current (largest) location; use when you want "N groups back" from live.
   * - Absolute: Absolute group/object offsets tied to an existing subscription (stable anchor) even if that subscription keeps forwarding.
   *
   * Field highlights (in {@link FetchOptions}):
   * - priority: 0 (highest) .. 255 (lowest); out-of-range rejected; non-integers rounded by caller expectation.
   * - groupOrder: {@link GroupOrder.Original} to preserve publisher order; or reorder ascending/descending if supported by server.
   * - typeAndProps: Discriminated union carrying parameters specific to each fetch mode (see examples).
   * - parameters: Optional version-specific extension block.
   *
   * Returns either a {@link FetchError} (refusal / invalid request at protocol level) or `{ requestId, stream }` whose `stream`
   * ends naturally after the bounded range completes (no explicit cancel needed for normal completion).
   *
   * Use cases:
   * - Grab a historical window for scrubbing UI while a separate live subscription tails.
   * - Late joiner fetching a short back-buffer then discarding the stream.
   * - Analytics batch job pulling a fixed slice without subscribing long-term.
   *
   * @throws MoqtailError If client is destroyed.
   * @throws ProtocolViolationError Priority out of [0-255] or missing/invalid joining subscription id for Relative/Absolute.
   * @throws InternalError Transport/control failure (the client disconnects first) then rethrows original error.
   *
   * @remarks
   * - Relative / Absolute require an existing active SUBSCRIBE `joiningRequestId`; if not found a {@link ProtocolViolationError} is thrown.
   * - Result stream is finite; reader close occurs automatically when last object delivered.
   * - Use {@link MoqtailClient.fetchCancel | fetchCancel} only for early termination (not yet fully implemented: see TODO in code).
   *
   * @example Standalone window
   * ```ts
   * const r = await client.fetch({
   *   priority: 64,
   *   groupOrder: GroupOrder.Original,
   *   typeAndProps: {
   *     type: FetchType.StandAlone,
   *     props: { fullTrackName, startLocation, endLocation }
   *   }
   * })
   * if (!(r instanceof FetchError)) {
   *   for await (const obj of r.stream as any) {
   *     // consume objects then stream ends automatically
   *   }
   * }
   * ```
   *
   * @example Relative to live subscription (e.g. last 5 groups)
   * ```ts
   * const sub = await client.subscribe({ fullTrackName, filterType: FilterType.LatestObject, forward: true, groupOrder: GroupOrder.Original, priority: 0 })
   * if (!(sub instanceof SubscribeError)) {
   *   const slice = await client.fetch({
   *     priority: 32,
   *     groupOrder: GroupOrder.Original,
   *     typeAndProps: { type: FetchType.Relative, props: { joiningRequestId: sub.requestId, joiningStart: 0n } }
   *   })
   * }
   * ```
   */
  // TODO: figure out how to handle joining fetch types
  // Do we need an existing subscription? What happens if that subscription forwards objects?
  // Will the subscribe objects be pushed through this FetchRequest.controller?
  async fetch(args: FetchOptions): Promise<FetchError | { requestId: bigint; stream: ReadableStream<MoqtObject> }> {
    this.#ensureActive()
    try {
      const { priority, groupOrder, typeAndProps, parameters } = args
      if (priority < 0 || priority > 255)
        throw new ProtocolViolationError(
          'MoqtailClient.fetch',
          `subscriberPriority: ${priority} must be in range of [0-255]`,
        )
      const params = parameters ? parameters.build() : new VersionSpecificParameters().build()
      let msg: Fetch
      let joiningRequest: MoqtailRequest | undefined
      // Generate unique requestId at the beginning to ensure uniqueness
      const requestId = this.#nextClientRequestId
      console.log(
        'MoqtailClient.fetch: generated requestId:',
        requestId,
        'for fetch type:',
        typeAndProps.type,
        'current #dontUseRequestId:',
        this.#dontUseRequestId,
      )
      switch (typeAndProps.type) {
        case FetchType.StandAlone:
          msg = new Fetch(
            requestId,
            priority,
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
            requestId,
            priority,
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
            requestId,
            priority,
            groupOrder,
            { type: typeAndProps.type, props: typeAndProps.props },
            params,
          )
          break
      }
      const request = new FetchRequest(msg)
      console.log(
        'MoqtailClient.fetch: storing FetchRequest with requestId:',
        msg.requestId,
        'for fetch type:',
        typeAndProps.type,
      )
      console.log('MoqtailClient.fetch: full fetch message:', {
        requestId: msg.requestId,
        fetchType: typeAndProps.type,
        joiningRequestId: typeAndProps.type !== FetchType.StandAlone ? typeAndProps.props.joiningRequestId : 'N/A',
      })
      this.requests.set(msg.requestId, request)
      console.log('MoqtailClient.fetch: about to send fetch message to server')
      await this.controlStream.send(msg)
      console.log('MoqtailClient.fetch: fetch message sent successfully, waiting for response')
      const response = await request
      if (response instanceof FetchError) {
        this.requests.delete(msg.requestId)
        return response
      } else {
        const stream = request.stream
        return { requestId: msg.requestId, stream }
      }
    } catch (error) {
      await this.disconnect(
        new InternalError('MoqtailClient.fetch', error instanceof Error ? error.message : String(error)),
      )
      throw error
    }
  }

  /**
   * Request early termination of an in‑flight FETCH identified by its `requestId`.
   *
   * Use when the consumer no longer needs the remaining objects (user scrubbed away, UI panel closed, replaced by a new fetch).
   * Sends a {@link FetchCancel} control frame if the id currently maps to an active fetch; otherwise silent no-op (idempotent).
   *
   * Parameter semantics:
   * - requestId: bigint returned from {@link MoqtailClient.fetch | fetch}. Numbers auto-converted to bigint.
   *
   * Current behavior / limitations:
   * - Data stream closure after cancel is TODO (objects may still arrive briefly).
   * - Unknown / already finished request: ignored without error.
   * - Only targets FETCH requests (not subscriptions).
   *
   * @throws MoqtailError If client is destroyed.
   * @throws InternalError Failure while sending the cancel (client disconnects first).
   *
   * @remarks
   * Follow-up improvement planned: actively close associated readable stream controller immediately upon acknowledgment.
   *
   * @example Cancel shortly after starting
   * ```ts
   * const r = await client.fetch({ priority: 32, groupOrder: GroupOrder.Original, typeAndProps: { type: FetchType.StandAlone, props: { fullTrackName, startLocation, endLocation } } })
   * if (!(r instanceof FetchError)) {
   *   // user navigated away
   *   await client.fetchCancel(r.requestId)
   * }
   * ```
   *
   * @example Idempotent double cancel
   * ```ts
   * await client.fetchCancel(456n)
   * await client.fetchCancel(456n) // no error
   * ```
   */
  async fetchCancel(requestId: bigint | number) {
    this.#ensureActive()
    try {
      if (typeof requestId === 'number') requestId = BigInt(requestId)
      const request = this.requests.get(requestId)
      if (request) {
        if (request instanceof Fetch) {
          // TODO: Fetch cancel, mark data streams for closure
          this.controlStream.send(new FetchCancel(requestId))
        }
      }
      // No matching fetch request, idempotent
    } catch (error) {
      await this.disconnect(
        new InternalError('MoqtailClient.fetchCancel', error instanceof Error ? error.message : String(error)),
      )
      throw error
    }
  }

  async trackStatusRequest(fullTrackName: FullTrackName, parameters?: VersionSpecificParameters) {
    this.#ensureActive()
    try {
      const params = parameters ? parameters.build() : new VersionSpecificParameters().build()
      const msg = new TrackStatusRequestMessage(this.#nextClientRequestId, fullTrackName, params)
      const request = new TrackStatusRequest(msg.requestId, msg)
      this.controlStream.send(msg)
      return await request
    } catch (error) {
      await this.disconnect(
        new InternalError('MoqtailClient.trackStatusRequest', error instanceof Error ? error.message : String(error)),
      )
      throw error
    }
  }

  // TODO: Each announced track should checked against ongoing subscribe_announces
  // If matches it should send an announce to that peer automatically
  /**
   * Declare (publish) a track namespace to the peer so subscribers using matching prefixes (via {@link subscribeAnnounces})
   * can discover and begin subscribing/fetching its tracks.
   *
   * Typical flow (publisher side):
   * 1. Prepare / register one or more {@link Track} objects locally (see {@link addOrUpdateTrack}).
   * 2. Call `announce(namespace)` once per namespace prefix to expose those tracks.
   * 3. Later, call {@link unannounce} when no longer publishing under that namespace.
   *
   * Parameter semantics:
   * - trackNamespace: Tuple representing the namespace prefix (e.g. ["camera","main"]). All tracks whose full names start with this tuple are considered within the announce scope.
   * - parameters: Optional {@link VersionSpecificParameters}; omitted => default instance.
   *
   * Returns: {@link AnnounceOk} on success (namespace added to `announcedNamespaces`) or {@link AnnounceError} explaining refusal.
   *
   * Use cases:
   * - Make a camera or sensor namespace available before any objects are pushed.
   * - Dynamically expose a newly created room / session namespace.
   * - Re-announce after reconnect to repopulate discovery state.
   *
   * @throws MoqtailError If client is destroyed.
   * @throws InternalError Transport/control failure while sending or awaiting response (client disconnects first).
   *
   * @remarks
   * - Duplicate announce detection is TODO (currently a second call will still send another ANNOUNCE; receiver behavior may vary).
   * - Successful announces are tracked in `announcedNamespaces`; manual removal occurs via {@link unannounce}.
   * - Discovery subscribers (those who issued {@link subscribeAnnounces}) will receive the resulting {@link Announce} message.
   *
   * @example Minimal announce
   * ```ts
   * const res = await client.announce(["camera","main"])
   * if (res instanceof AnnounceOk) {
   *   // ready to publish objects under tracks with this namespace prefix
   * }
   * ```
   *
   * @example Announce with parameters block
   * ```ts
   * const params = new VersionSpecificParameters().setSomeExtensionFlag(true)
   * const resp = await client.announce(["room","1234"], params)
   * ```
   */
  async announce(trackNamespace: Tuple, parameters?: VersionSpecificParameters) {
    this.#ensureActive()
    try {
      // TODO: Check for duplicate announces
      const params = parameters ? parameters.build() : new VersionSpecificParameters().build()
      const msg = new Announce(this.#nextClientRequestId, trackNamespace, params)
      const request = new AnnounceRequest(msg.requestId, msg)
      this.requests.set(msg.requestId, request)
      this.controlStream.send(msg)
      const response = await request
      if (response instanceof AnnounceOk) this.announcedNamespaces.add(msg.trackNamespace)
      this.requests.delete(msg.requestId)
      return response
    } catch (error) {
      await this.disconnect(
        new InternalError('MoqtailClient.announce', error instanceof Error ? error.message : String(error)),
      )
      throw error
    }
  }

  /**
   * Withdraw a previously announced namespace so new subscribers no longer discover its tracks.
   *
   * Use when shutting down publishing for a logical scope (camera offline, room closed, session ended).
   * Removes the namespace from `announcedNamespaces` locally and sends an {@link Unannounce} control frame.
   *
   * Parameter semantics:
   * - trackNamespace: Exact tuple used during {@link announce}. Must match to be removed from internal set.
   *
   * Behavior:
   * - Does not delete locally registered {@link Track} objects (they remain in `trackSources`).
   * - Does not forcibly end active subscriptions that were already established; peers simply stop discovering it for new ones.
   * - Silent if the namespace was not currently recorded (idempotent style).
   *
   * @throws MoqtailError If client is destroyed before sending.
   * @throws (rethrows original error) Any lower-level failure while sending results in a disconnect (unwrapped TODO: future wrap with InternalError for consistency).
   *
   * @remarks
   * Peers that issued {@link subscribeAnnounces} for a matching prefix should receive the resulting {@link Unannounce}.
   * Consider calling this before {@link disconnect} to give consumers prompt notice.
   *
   * @example Basic usage
   * ```ts
   * await client.unannounce(["camera","main"])
   * ```
   *
   * @example Idempotent
   * ```ts
   * await client.unannounce(["camera","main"]) // first time
   * await client.unannounce(["camera","main"]) // no error, already removed
   * ```
   */
  async unannounce(trackNamespace: Tuple) {
    this.#ensureActive()
    try {
      const msg = new Unannounce(trackNamespace)
      this.announcedNamespaces.delete(msg.trackNamespace)
      await this.controlStream.send(msg)
    } catch (err) {
      // TODO: Match against error cases
      await this.disconnect()
      throw err
    }
  }

  /**
   * Send an {@link AnnounceCancel} to abort a previously issued ANNOUNCE before (or after) the peer fully processes it.
   *
   * Use when an announce was sent prematurely (e.g. validation failed locally, namespace no longer needed) and you want
   * to retract it without waiting for normal announce lifecycle or before publishing any objects.
   *
   * Parameter semantics:
   * - msg: Pre-constructed {@link AnnounceCancel} referencing the original announce request id / namespace (builder provided elsewhere).
   *
   * Behavior:
   * - Simply forwards the control frame; does not modify `announcedNamespaces` (call {@link unannounce} for local bookkeeping removal).
   * - Safe to send even if the announce already succeeded; peer may ignore duplicates per spec guidance.
   *
   * @throws MoqtailError If client is destroyed.
   * @throws InternalError Wrapped transport/control send failure (client disconnects first) then rethrows.
   *
   * @remarks
   * Use in tandem with internal tracking if you want to prevent subsequent object publication until a new announce is issued.
   *
   * @example Cancel immediately after a mistaken announce
   * ```ts
   * const announceResp = await client.announce(["camera","temp"]) // wrong namespace
   * // Assume you kept the original announce requestId (e.g. from AnnounceRequest)
   * const cancelMsg = new AnnounceCancel(announceResp.requestId as bigint)
   * await client.announceCancel(cancelMsg)
   * ```
   */
  async announceCancel(msg: AnnounceCancel) {
    this.#ensureActive()
    try {
      await this.controlStream.send(msg)
    } catch (error) {
      await this.disconnect(
        new InternalError('MoqtailClient.announceCancel', error instanceof Error ? error.message : String(error)),
      )
      throw error
    }
  }

  // INFO: Subscriber calls this the get matching announce messages with this prefix
  async subscribeAnnounces(msg: SubscribeAnnounces) {
    this.#ensureActive()
    try {
      await this.controlStream.send(msg)
    } catch (error) {
      await this.disconnect(
        new InternalError('MoqtailClient.subscribeAnnounces', error instanceof Error ? error.message : String(error)),
      )
      throw error
    }
  }

  async unsubscribeAnnounces(msg: UnsubscribeAnnounces) {
    this.#ensureActive()
    try {
      await this.controlStream.send(msg)
    } catch (error) {
      await this.disconnect(
        new InternalError('MoqtailClient.unsubscribeAnnounces', error instanceof Error ? error.message : String(error)),
      )
      throw error
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
      //this.disconnect()
      // throw error
      console.log('acceptIncomingUniStreams error', error)
    }
  }
  // TODO: Handle request cancellation. Cancel streams are expected to receive some on-fly objects.
  // Do a timeout? Wait for certain amount of objects?
  async #handleRecvStreams(incomingUniStream: ReadableStream): Promise<void> {
    this.#ensureActive()
    try {
      const recvStream = await RecvStream.new(incomingUniStream, this.dataStreamTimeoutMs, this.onDataReceived)
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
                // Fetch data stream complete - don't delete request here, FetchOk handler will do it
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
                switch (header.type) {
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
      //this.disconnect()
      throw error
    }
  }
}
