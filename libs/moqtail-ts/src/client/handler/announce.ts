import { Announce } from '../../model/control'
import { ControlMessageHandler } from './handler'

export const handlerAnnounce: ControlMessageHandler<Announce> = async (client, msg) => {
  if (client.onTrackAnnounced) {
    client.onTrackAnnounced(msg)
  }
}
