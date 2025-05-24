import { Fetch } from '@/model'
import { MoqtailClient } from '../client'
import { Track } from '../track/track'

export class FetchPublication {
  readonly requestId: bigint
  readonly track: Track
  isCanceled = false
  private msg: Fetch
  private client: MoqtailClient

  constructor(client: MoqtailClient, requestId: bigint, track: Track, fetchRequest: Fetch) {
    this.client = client
    this.requestId = requestId
    this.track = track
    this.msg = fetchRequest
  }

  cancel() {
    this.isCanceled = true
  }

  async publish(): Promise<void> {
    if (this.track.contentSource.getObjectRange) {
      await this.track.contentSource.getObjectRange(
        this.msg.standaloneFetchProps!.startLocation,
        this.msg.standaloneFetchProps!.startLocation,
      )
      await this.client.webTransport.createUnidirectionalStream()
    }
  }
}
