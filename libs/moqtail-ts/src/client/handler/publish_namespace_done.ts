import { PublishNamespaceDone } from '../../model/control'
import { ControlMessageHandler } from './handler'

export const handlerPublishNamespaceDone: ControlMessageHandler<PublishNamespaceDone> = async (client, msg) => {
  if (client.onNamespaceDone) {
    client.onNamespaceDone(msg)
  }
}
