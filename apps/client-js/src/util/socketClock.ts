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
