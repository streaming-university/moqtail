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

import { AnnounceOk } from '../../model/control/announce_ok'
import { AnnounceError } from '../../model/control/announce_error'
import { Announce } from '../../model/control/announce'
import { AnnounceErrorCode, ReasonPhrase } from '@/model'

export class AnnounceRequest implements PromiseLike<AnnounceOk | AnnounceError> {
  public readonly requestId: bigint
  public readonly message: Announce
  private _resolve!: (value: AnnounceOk | AnnounceError | PromiseLike<AnnounceOk | AnnounceError>) => void
  private _reject!: (reason?: any) => void
  private promise: Promise<AnnounceOk | AnnounceError>

  constructor(requestId: bigint, message: Announce) {
    this.requestId = requestId
    this.message = message
    this.promise = new Promise<AnnounceOk | AnnounceError>((resolve, reject) => {
      this._resolve = resolve
      this._reject = reject
    })
  }

  public resolve(value: AnnounceOk | AnnounceError | PromiseLike<AnnounceOk | AnnounceError>): void {
    this._resolve(value)
  }

  public reject(reason?: any): void {
    this._reject(reason)
  }

  public then<TResult1 = AnnounceOk | AnnounceError, TResult2 = never>(
    onfulfilled?: ((value: AnnounceOk | AnnounceError) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected)
  }

  public catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
  ): Promise<AnnounceOk | AnnounceError | TResult> {
    return this.promise.catch(onrejected)
  }

  public finally(onfinally?: (() => void) | undefined | null): Promise<AnnounceOk | AnnounceError> {
    return this.promise.finally(onfinally)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect, vi } = import.meta.vitest

  describe('AnnounceRequest', () => {
    test('should resolve with AnnounceOk on success', async () => {
      const announceMessage = {} as Announce
      const request = new AnnounceRequest(123n, announceMessage)
      const announceOkResponse = new AnnounceOk(123n)
      setTimeout(() => request.resolve(announceOkResponse), 0)
      const result = await request
      expect(result).toBeInstanceOf(AnnounceOk)
      expect(result.requestId).toBe(123n)
    })

    test('should resolve with AnnounceError on protocol error', async () => {
      const announceMessage = {} as Announce
      const request = new AnnounceRequest(123n, announceMessage)
      const announceError = new AnnounceError(123n, AnnounceErrorCode.InternalError, new ReasonPhrase('wololo'))
      setTimeout(() => request.resolve(announceError), 0)
      const result = await request
      expect(result).toBeInstanceOf(AnnounceError)
      expect(result.requestId).toBe(123n)
      if (result instanceof AnnounceError) {
        expect(result.errorCode).toBe(AnnounceErrorCode.InternalError)
      } else {
        throw new Error('Expected AnnounceError')
      }
    })

    test('should reject on exception', async () => {
      const announceMessage = {} as Announce
      const request = new AnnounceRequest(123n, announceMessage)
      const error = new Error('Network failure')
      setTimeout(() => request.reject(error), 0)
      await expect(request).rejects.toBe(error)
    })

    test('can be used with async/await for success', async () => {
      const announceMessage = {} as Announce
      const request = new AnnounceRequest(456n, announceMessage)
      const announceOkResponse = new AnnounceOk(456n)
      setTimeout(() => request.resolve(announceOkResponse), 10)
      const result = await request
      expect(result).toBeInstanceOf(AnnounceOk)
      expect(result.requestId).toBe(456n)
    })

    test('can be used with async/await for protocol error', async () => {
      const announceMessage = {} as Announce
      const request = new AnnounceRequest(789n, announceMessage)
      const announceError = new AnnounceError(789n, AnnounceErrorCode.MalformedAuthToken, new ReasonPhrase('bad token'))
      setTimeout(() => request.resolve(announceError), 10)
      const result = await request
      expect(result).toBeInstanceOf(AnnounceError)
      expect(result.requestId).toBe(789n)
      if (result instanceof AnnounceError) {
        expect(result.errorCode).toBe(AnnounceErrorCode.MalformedAuthToken)
      } else {
        throw new Error('Expected AnnounceError')
      }
    })

    test('finally block is executed on resolve', async () => {
      const announceMessage = {} as Announce
      const request = new AnnounceRequest(111n, announceMessage)
      const announceOkResponse = new AnnounceOk(111n)
      const finallyCallback = vi.fn()
      setTimeout(() => request.resolve(announceOkResponse), 0)
      await request.finally(finallyCallback)
      expect(finallyCallback).toHaveBeenCalledTimes(1)
    })

    test('finally block is executed on reject', async () => {
      const announceMessage = {} as Announce
      const request = new AnnounceRequest(222n, announceMessage)
      const error = new Error('timeout')
      const finallyCallback = vi.fn()
      setTimeout(() => request.reject(error), 0)
      try {
        await request.finally(finallyCallback)
      } catch (e) {
        // Expected rejection
      }
      expect(finallyCallback).toHaveBeenCalledTimes(1)
    })
  })
}
