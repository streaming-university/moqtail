import { FullTrackName, InternalError, Location, ReasonPhrase } from '@/model'
import { Fetch, FetchError, FetchErrorCode, FetchOk, FetchType } from '../../model/control'
import { ControlMessageHandler } from './handler'
import { SubscribePublication } from '../publication/subscribe'
import { FetchPublication } from '../publication/fetch'
import { LiveContentSource } from '../track/content_source'

export const handlerFetch: ControlMessageHandler<Fetch> = async (client, msg) => {
  // TODO: Use fetch parameters and handle authorization
  let fullTrackName: FullTrackName | undefined
  let joiningRequest: SubscribePublication | FetchPublication | undefined
  switch (msg.typeAndProps.type) {
    case FetchType.StandAlone:
      fullTrackName = msg.typeAndProps.props.fullTrackName
      break

    case FetchType.Relative:
    case FetchType.Absolute:
      joiningRequest = client.publications.get(msg.typeAndProps.props.joiningRequestId)
      if (!(joiningRequest instanceof SubscribePublication))
        throw new InternalError('handlerFetch', 'No subscription for the joining request id')
      fullTrackName = joiningRequest.track.fullTrackName
      break
  }
  const track = client.trackSources.get(fullTrackName.toString())
  if (!track) {
    const response = new FetchError(
      msg.requestId,
      FetchErrorCode.TrackDoesNotExist,
      new ReasonPhrase('Track does not exists'),
    )
    await client.controlStream.send(response)
    return
  }

  if (track.contentSource instanceof LiveContentSource) {
    const response = new FetchError(
      msg.requestId,
      FetchErrorCode.NotSupported,
      new ReasonPhrase('Requested track does not support fetch'),
    )
    await client.controlStream.send(response)
    return
  }
  // TODO: Add support for descending group order
  // TODO: Handle parameter checking and parameter selection.
  // TODO: Figure out what to do with endOfTrack and end location
  const publication = new FetchPublication(client, track, msg)
  client.publications.set(msg.requestId, publication)
  const response = FetchOk.newAscending(msg.requestId, false, new Location(0n, 0n), msg.parameters)
  await client.controlStream.send(response)
}
