import { Fetch, FetchError, FetchOk, MoqtObject } from '@/model'

export class FetchRequest implements PromiseLike<FetchOk | FetchError> {
  public readonly requestId: bigint
  public readonly message: Fetch
  private _resolve!: (value: FetchOk | FetchError | PromiseLike<FetchOk | FetchError>) => void
  private _reject!: (reason?: any) => void
  private promise: Promise<FetchOk | FetchError>
  public controller?: ReadableStreamDefaultController<MoqtObject>
  public stream: ReadableStream<MoqtObject>
  public isActive: boolean = true
  public isResolved: boolean = false

  constructor(requestId: bigint, message: Fetch) {
    this.requestId = requestId
    this.message = message
    this.stream = new ReadableStream<MoqtObject>({
      start: (controller) => {
        this.controller = controller
      },
    })
    this.promise = new Promise<FetchOk | FetchError>((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }

  public resolve(value: FetchOk | FetchError | PromiseLike<FetchOk | FetchError>): void {
    this._resolve(value)
  }

  public reject(reason?: any): void {
    this._reject(reason)
  }

  public then<TResult1 = FetchOk | FetchError, TResult2 = never>(
    onfulfilled?: ((value: FetchOk | FetchError) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected)
  }

  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
  ): Promise<FetchOk | FetchError | TResult> {
    return this.promise.catch(onrejected)
  }

  public finally(onfinally?: (() => void) | undefined | null): Promise<FetchOk | FetchError> {
    return this.promise.finally(onfinally)
  }
}
