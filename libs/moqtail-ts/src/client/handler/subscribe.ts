import { ReasonPhrase } from '@/model'
import { Subscribe, SubscribeError, SubscribeErrorCode, SubscribeOk } from '../../model/control'
import { ControlMessageHandler } from './handler'
import { SubscribePublication } from '../publication/subscribe'
import { LiveContentSource } from '../track/content_source'

export const handlerSubscribe: ControlMessageHandler<Subscribe> = async (client, msg) => {
  const track = client.trackSources.get(msg.fullTrackName.toString())
  if (track) {
    if (track.contentSource instanceof LiveContentSource) {
      // TODO: Add support for descending group order
      let subscribeOk: SubscribeOk
      if (track.contentSource.largestLocation) {
        subscribeOk = SubscribeOk.newAscendingWithContent(
          msg.requestId,
          0n,
          track.contentSource.largestLocation,
          msg.subscribeParameters,
        )
      } else {
        subscribeOk = SubscribeOk.newAscendingNoContent(msg.requestId, 0n, msg.subscribeParameters)
      }
      const publication = new SubscribePublication(client, track, msg, subscribeOk.largestLocation)
      console.log('setting publication', msg.requestId, publication)
      client.publications.set(msg.requestId, publication)
      await client.controlStream.send(subscribeOk)
    } else {
      // TODO: Track doesnt support subscribe (Hybrid does so hence todo)
    }
  } else {
    const subscribeError = new SubscribeError(
      msg.requestId,
      SubscribeErrorCode.TrackDoesNotExist,
      new ReasonPhrase('Track does not exist'),
      0n, // TODO: Since track does not exist alias is set to zero. This argument is removed in the upcoming version
    )
    await client.controlStream.send(subscribeError)
  }
}
