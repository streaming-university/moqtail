import { Location, MoqtObject, Subscribe, SubscribeError, SubscribeOk } from '@/model'

export class SubscribeRequest implements PromiseLike<SubscribeOk | SubscribeError> {
  public readonly requestId: bigint
  public readonly message: Subscribe
  private _resolve!: (value: SubscribeOk | SubscribeError | PromiseLike<SubscribeOk | SubscribeError>) => void
  private _reject!: (reason?: any) => void
  private promise: Promise<SubscribeOk | SubscribeError>
  public controller?: ReadableStreamDefaultController<MoqtObject>
  public stream: ReadableStream<MoqtObject>
  public streamsAccepted: bigint = 0n
  public largestLocation: Location | undefined
  public expectedStreams: bigint | undefined

  constructor(requestId: bigint, message: Subscribe) {
    this.requestId = requestId
    this.message = message
    this.stream = new ReadableStream<MoqtObject>({
      start: (controller) => {
        this.controller = controller
      },
    })
    this.promise = new Promise<SubscribeOk | SubscribeError>((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }

  public resolve(value: SubscribeOk | SubscribeError | PromiseLike<SubscribeOk | SubscribeError>): void {
    this._resolve(value)
  }

  public reject(reason?: any): void {
    this._reject(reason)
  }

  public then<TResult1 = SubscribeOk | SubscribeError, TResult2 = never>(
    onfulfilled?: ((value: SubscribeOk | SubscribeError) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected)
  }

  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
  ): Promise<SubscribeOk | SubscribeError | TResult> {
    return this.promise.catch(onrejected)
  }

  public finally(onfinally?: (() => void) | undefined | null): Promise<SubscribeOk | SubscribeError> {
    return this.promise.finally(onfinally)
  }
}
