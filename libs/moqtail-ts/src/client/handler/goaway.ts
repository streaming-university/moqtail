import { GoAway } from '../../model/control'
import { ControlMessageHandler } from './handler'

export const handlerGoAway: ControlMessageHandler<GoAway> = async (client, msg) => {
  if (client.onGoaway) {
    client.onGoaway(msg)
  }
}
