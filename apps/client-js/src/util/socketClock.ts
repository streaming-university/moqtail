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

import { Socket } from 'socket.io-client'
import { Clock } from 'moqtail-ts/util'

export class SocketClock implements Clock {
  private offset: number | undefined
  private requestTime: number | undefined

  constructor(readonly socket: Socket) {
    this.syncTime()

    setInterval(() => this.syncTime(), 30000)
  }

  private syncTime(): void {
    this.requestTime = Date.now()
    this.socket.emit('time')

    this.socket.once('time', ({ serverTime }) => {
      if (this.requestTime !== undefined) {
        const responseTime = Date.now()
        const rtt = responseTime - this.requestTime
        const oneWayDelay = rtt / 2

        const estimatedLocalTimeAtServer = this.requestTime + oneWayDelay

        // Calculate offset: positive means server is ahead of local time
        this.offset = serverTime - estimatedLocalTimeAtServer
      }
    })
  }

  now(): number {
    if (this.offset === undefined) {
      return Date.now()
    }
    return Date.now() + this.offset
  }
}
