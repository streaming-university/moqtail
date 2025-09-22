import { SubscribeNamespace, SubscribeNamespaceError, SubscribeNamespaceOk } from '@/model'

export class SubscribeNamespaceRequest implements PromiseLike<SubscribeNamespaceOk | SubscribeNamespaceError> {
  public readonly requestId: bigint
  public readonly message: SubscribeNamespace
  private _resolve!: (
    value: SubscribeNamespaceOk | SubscribeNamespaceError | PromiseLike<SubscribeNamespaceOk | SubscribeNamespaceError>,
  ) => void
  private _reject!: (reason?: any) => void
  private promise: Promise<SubscribeNamespaceOk | SubscribeNamespaceError>

  constructor(requestId: bigint, message: SubscribeNamespace) {
    this.requestId = requestId
    this.message = message
    this.promise = new Promise<SubscribeNamespaceOk | SubscribeNamespaceError>((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }

  public resolve(
    value: SubscribeNamespaceOk | SubscribeNamespaceError | PromiseLike<SubscribeNamespaceOk | SubscribeNamespaceError>,
  ): void {
    this._resolve(value)
  }

  public reject(reason?: any): void {
    this._reject(reason)
  }

  public then<TResult1 = SubscribeNamespaceOk | SubscribeNamespaceError, TResult2 = never>(
    onfulfilled?:
      | ((value: SubscribeNamespaceOk | SubscribeNamespaceError) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected)
  }

  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
  ): Promise<SubscribeNamespaceOk | SubscribeNamespaceError | TResult> {
    return this.promise.catch(onrejected)
  }

  public finally(onfinally?: (() => void) | undefined | null): Promise<SubscribeNamespaceOk | SubscribeNamespaceError> {
    return this.promise.finally(onfinally)
  }
}
