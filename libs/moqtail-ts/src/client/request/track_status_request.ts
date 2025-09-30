/**
 * Copyright 2025 The MOQtail Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { TrackStatus, TrackStatusRequestMessage as TrackStatusRequestMessage } from '@/model'

export class TrackStatusRequest implements PromiseLike<TrackStatus> {
  public readonly requestId: bigint
  public readonly message: TrackStatusRequestMessage
  private _resolve!: (value: TrackStatus | PromiseLike<TrackStatus>) => void
  private _reject!: (reason?: any) => void
  private promise: Promise<TrackStatus>

  constructor(requestId: bigint, message: TrackStatusRequestMessage) {
    this.requestId = requestId
    this.message = message
    this.promise = new Promise<TrackStatus>((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }

  public resolve(value: TrackStatus | PromiseLike<TrackStatus>): void {
    this._resolve(value)
  }

  public reject(reason?: any): void {
    this._reject(reason)
  }

  public then<TResult1 = TrackStatus, TResult2 = never>(
    onfulfilled?: ((value: TrackStatus) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected)
  }

  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
  ): Promise<TrackStatus | TResult> {
    return this.promise.catch(onrejected)
  }

  public finally(onfinally?: (() => void) | undefined | null): Promise<TrackStatus> {
    return this.promise.finally(onfinally)
  }
}
