import { ReasonPhrase } from '@/model'
import { Subscribe, SubscribeError, SubscribeErrorCode, SubscribeOk } from '../../model/control'
import { ControlMessageHandler } from './handler'
import { SubscribePublication } from '../publication/subscribe'
import { random60bitId } from '../util/random_id'

export const handlerSubscribe: ControlMessageHandler<Subscribe> = async (client, msg) => {
  const track = client.trackSources.get(msg.fullTrackName.toString())
  if (!track) {
    const subscribeError = new SubscribeError(
      msg.requestId,
      SubscribeErrorCode.TrackDoesNotExist,
      new ReasonPhrase('Track does not exist'),
      0n, // TODO: Since track does not exist alias is set to zero. This argument is removed in the upcoming version
    )
    await client.controlStream.send(subscribeError)
    return
  }
  if (!track.trackSource.live) {
    const response = new SubscribeError(
      msg.requestId,
      SubscribeErrorCode.NotSupported,
      new ReasonPhrase('Requested track does not support subscribe'),
      0n,
    )
    await client.controlStream.send(response)
    return
  }
  if (client.trackAliasMap.containsAlias(msg.trackAlias)) {
    const response = new SubscribeError(
      msg.requestId,
      SubscribeErrorCode.RetryTrackAlias,
      new ReasonPhrase('Track alias already in use'),
      random60bitId(), // TODO: This should with client.trackAliasMap.containsAlias(msg.trackAlias) and retried until it passes
      // 60 bit duplication is highly unlikely but nevertheless this track alias must be guaranteed
    )
    await client.controlStream.send(response)
    return
  }
  let subscribeOk: SubscribeOk
  if (track.trackSource.live.largestLocation) {
    subscribeOk = SubscribeOk.newAscendingWithContent(
      msg.requestId,
      0n,
      track.trackSource.live.largestLocation,
      msg.subscribeParameters,
    )
  } else {
    // TODO: Add support for descending group order
    subscribeOk = SubscribeOk.newAscendingNoContent(msg.requestId, 0n, msg.subscribeParameters)
  }
  const publication = new SubscribePublication(client, track, msg, subscribeOk.largestLocation)
  client.publications.set(msg.requestId, publication)
  await client.controlStream.send(subscribeOk)
}
