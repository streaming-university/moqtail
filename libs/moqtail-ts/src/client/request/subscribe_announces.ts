import { SubscribeAnnounces, SubscribeAnnouncesError, SubscribeAnnouncesOk } from '@/model'

export class SubscribeAnnouncesRequest implements PromiseLike<SubscribeAnnouncesOk | SubscribeAnnouncesError> {
  public readonly requestId: bigint
  public readonly message: SubscribeAnnounces
  private _resolve!: (
    value: SubscribeAnnouncesOk | SubscribeAnnouncesError | PromiseLike<SubscribeAnnouncesOk | SubscribeAnnouncesError>,
  ) => void
  private _reject!: (reason?: any) => void
  private promise: Promise<SubscribeAnnouncesOk | SubscribeAnnouncesError>

  constructor(requestId: bigint, message: SubscribeAnnounces) {
    this.requestId = requestId
    this.message = message
    this.promise = new Promise<SubscribeAnnouncesOk | SubscribeAnnouncesError>((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }

  public resolve(
    value: SubscribeAnnouncesOk | SubscribeAnnouncesError | PromiseLike<SubscribeAnnouncesOk | SubscribeAnnouncesError>,
  ): void {
    this._resolve(value)
  }

  public reject(reason?: any): void {
    this._reject(reason)
  }

  public then<TResult1 = SubscribeAnnouncesOk | SubscribeAnnouncesError, TResult2 = never>(
    onfulfilled?:
      | ((value: SubscribeAnnouncesOk | SubscribeAnnouncesError) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected)
  }

  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
  ): Promise<SubscribeAnnouncesOk | SubscribeAnnouncesError | TResult> {
    return this.promise.catch(onrejected)
  }

  public finally(onfinally?: (() => void) | undefined | null): Promise<SubscribeAnnouncesOk | SubscribeAnnouncesError> {
    return this.promise.finally(onfinally)
  }
}
