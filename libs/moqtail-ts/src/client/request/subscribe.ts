import {
  FullTrackName,
  KeyValuePair,
  Location,
  MoqtObject,
  Subscribe,
  SubscribeError,
  SubscribeOk,
  SubscribeUpdate,
} from '@/model'

// TODO: Add timeout mechanism for unsubscribing
export class SubscribeRequest implements PromiseLike<SubscribeOk | SubscribeError> {
  readonly requestId: bigint
  readonly trackAlias: bigint
  readonly fullTrackName: FullTrackName
  isCanceled: boolean = false
  startLocation: Location | undefined
  endGroup: bigint | undefined
  priority: number
  forward: boolean
  subscribeParameters: KeyValuePair[]
  largestLocation: Location | undefined // Updated on each received object
  streamsAccepted: bigint = 0n
  expectedStreams: bigint | undefined // Defined upon SUBSCRIBE_DONE
  readonly controller!: ReadableStreamDefaultController<MoqtObject>
  readonly stream: ReadableStream<MoqtObject>
  #promise: Promise<SubscribeOk | SubscribeError>
  #resolve!: (value: SubscribeOk | SubscribeError | PromiseLike<SubscribeOk | SubscribeError>) => void
  #reject!: (reason?: any) => void

  constructor(msg: Subscribe) {
    this.requestId = msg.requestId
    this.requestId = msg.requestId
    this.trackAlias = msg.trackAlias
    this.fullTrackName = msg.fullTrackName
    this.startLocation = msg.startLocation
    this.endGroup = msg.endGroup
    this.priority = msg.subscriberPriority
    this.forward = msg.forward
    this.subscribeParameters = msg.subscribeParameters
    this.stream = new ReadableStream<MoqtObject>({
      start: (controller) => {
        ;(this.controller as any) = controller
      },
    })
    this.#promise = new Promise<SubscribeOk | SubscribeError>((resolve, reject) => {
      this.#resolve = resolve
      this.#reject = reject
    })
  }
  update(msg: SubscribeUpdate): void {
    this.startLocation = msg.startLocation
    this.endGroup = msg.endGroup
    this.forward = msg.forward
    this.priority = msg.subscriberPriority
    this.subscribeParameters = msg.subscribeParameters
  }
  unsubscribe(): void {
    this.isCanceled = true
  }
  resolve(value: SubscribeOk | SubscribeError | PromiseLike<SubscribeOk | SubscribeError>): void {
    this.#resolve(value)
  }

  reject(reason?: any): void {
    this.#reject(reason)
  }

  then<TResult1 = SubscribeOk | SubscribeError, TResult2 = never>(
    onfulfilled?: ((value: SubscribeOk | SubscribeError) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.#promise.then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
  ): Promise<SubscribeOk | SubscribeError | TResult> {
    return this.#promise.catch(onrejected)
  }

  finally(onfinally?: (() => void) | undefined | null): Promise<SubscribeOk | SubscribeError> {
    return this.#promise.finally(onfinally)
  }
}
