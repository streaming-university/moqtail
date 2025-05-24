import { Unannounce } from '../../model/control'
import { ControlMessageHandler } from './handler'

export const handlerUnannounce: ControlMessageHandler<Unannounce> = async (client, msg) => {
  if (client.onTrackUnannounced) {
    client.onTrackUnannounced(msg)
  }
}
