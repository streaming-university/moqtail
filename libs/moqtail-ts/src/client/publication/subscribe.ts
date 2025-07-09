import { FilterType, Subscribe, SubscribeDone, SubscribeDoneStatusCode, SubscribeUpdate } from '@/model/control'
import { MoqtailClient } from '../client'
import { Track } from '../track/track'
import { Location, ReasonPhrase, VersionSpecificParameter, VersionSpecificParameters } from '@/model'
import { SendStream } from '../data_stream'
import { SubgroupHeader } from '@/model/data/subgroup_header'
import { MoqtObject } from '@/model/data/object'
import { LiveContentSource } from '../track/content_source'
import { SimpleLock } from '../../util/simple_lock'
export class SubscribePublication {
  private startLocation: Location
  private endGroup: bigint | undefined
  private subscriberPriority: number
  private forward: boolean
  private subscribeParameters: VersionSpecificParameter[]
  private streamsOpened: bigint = 0n
  private cancelPublishing?: () => void
  #isStarted = false
  private isCompleted = false
  latestLocation?: Location
  private lock: SimpleLock = new SimpleLock()
  // Use a map to manage SendStreams per group
  #streams: Map<bigint, SendStream> = new Map()
  #id = Math.floor(Math.random() * 1000000)

  constructor(
    private readonly client: MoqtailClient,
    readonly track: Track,
    private readonly subscribeMsg: Subscribe,
    largestLocation?: Location,
  ) {
    switch (subscribeMsg.filterType) {
      case FilterType.LatestObject:
        if (largestLocation) {
          this.startLocation = new Location(largestLocation.group, largestLocation.object + 1n)
        } else {
          this.startLocation = new Location(0n, 0n)
        }
        break
      case FilterType.NextGroupStart:
        if (largestLocation) {
          this.startLocation = new Location(largestLocation.group + 1n, 0n)
        } else {
          this.startLocation = new Location(0n, 0n)
        }
        break
      case FilterType.AbsoluteStart:
        this.startLocation = subscribeMsg.startLocation!
        break
      case FilterType.AbsoluteRange:
        this.startLocation = subscribeMsg.startLocation!
        this.endGroup = subscribeMsg.endGroup
        break
    }
    this.subscriberPriority = subscribeMsg.subscriberPriority
    this.forward = subscribeMsg.forward
    this.subscribeParameters = VersionSpecificParameters.fromKeyValuePairs(subscribeMsg.subscribeParameters)
    this.publish()
  }

  // When unsubscribe is received
  cancel(): void {
    if (this.cancelPublishing) {
      this.cancelPublishing()
      this.client.publications.delete(this.subscribeMsg.requestId)
    }
    this.isCompleted = true
  }

  async done(statusCode: SubscribeDoneStatusCode): Promise<void> {
    this.isCompleted = true
    const subscribeDone = new SubscribeDone(
      this.subscribeMsg.requestId,
      statusCode,
      BigInt(this.streamsOpened),
      new ReasonPhrase('Subscription ended'),
    )
    // TODO: Handle track completion, there might be ongoing streams. Wait for all to finish before
    // cleaning the state
    await this.client.controlStream.send(subscribeDone)
  }

  update(msg: SubscribeUpdate): void {
    // TODO: Control checks on update rules e.g only narrowing, end>start
    this.startLocation = msg.startLocation
    this.endGroup = msg.endGroup
    this.subscriberPriority = msg.subscriberPriority
    this.forward = msg.forward
    this.subscribeParameters = VersionSpecificParameters.fromKeyValuePairs(msg.subscribeParameters)
  }

  async publish(): Promise<void> {
    if (this.track.contentSource instanceof LiveContentSource) {
      //TODO: HybridContent is also allowed
      this.track.contentSource.onDone(() => {
        this.done(SubscribeDoneStatusCode.TrackEnded)
      })

      this.cancelPublishing = this.track.contentSource.onNewObject(async (obj: MoqtObject) => {
        if (this.isCompleted) return
        if (!this.forward) return
        if (!this.#isStarted && this.startLocation.compare(obj.location) <= 0) {
          this.#isStarted = true
        }
        if (this.#isStarted) {
          try {
            if (!this.#streams.has(obj.location.group)) {
              await this.lock.acquire()
              if (!this.#streams.has(obj.location.group)) {
                // New group or first object
                const writeStream = await this.client.webTransport.createUnidirectionalStream()
                const header = new SubgroupHeader(
                  obj.subgroupHeaderType,
                  this.track.trackAlias,
                  obj.location.group,
                  obj.subgroupId ?? null,
                  this.subscriberPriority,
                )
                const sendStream = await SendStream.new(writeStream, header)
                this.#streams.set(obj.location.group, sendStream)
                this.streamsOpened++
                // console.log('streamsOpened: %d', this.streamsOpened)
              }
              await this.lock.release()
            }

            const sendStream = this.#streams.get(obj.location.group)!
            await this.lock.acquire()
            await sendStream.write(obj.tryIntoSubgroupObject())
            await this.lock.release()
            //console.info('Published object:', obj.groupId)

            // If this is the last object in the group (for AbsoluteRange/endGroup), close the stream
            if (this.endGroup && obj.location.group === this.endGroup) {
              try {
                await this.lock.acquire()
                if (this.#streams.has(obj.location.group)) {
                  await sendStream.close()
                  this.#streams.delete(obj.location.group)
                }
                await this.lock.release()
              } catch (err) {
                console.warn('error in closing stream: id, endGroup, err', this.#id, this.endGroup, err)
              }
              await this.done(SubscribeDoneStatusCode.SubscriptionEnded)
              this.cancel()
            } else if (this.latestLocation && this.latestLocation.group !== obj.location.group) {
              // TODO: Maybe don't close the previous stream, discuss
              // If group changed, close previous group's stream
              const prevGroup = this.latestLocation.group
              try {
                await this.lock.acquire()
                const prevStream = this.#streams.get(prevGroup)
                if (prevStream) {
                  try {
                    await prevStream.close()
                  } catch (err) {
                    console.warn('error in closing stream', prevGroup, err)
                  }
                  this.#streams.delete(prevGroup)
                }
                await this.lock.release()
              } catch (err) {
                console.warn(
                  'error in closing stream: id, latestLocation.group, err',
                  this.#id,
                  this.latestLocation.group,
                  err,
                )
              }
            }
            await this.lock.acquire()
            this.latestLocation = obj.location
            await this.lock.release()
          } catch (err) {
            this.cancel()
            throw err
          }
        }
      })
    }
  }
}
