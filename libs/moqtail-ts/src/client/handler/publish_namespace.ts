import { PublishNamespace } from '../../model/control'
import { ControlMessageHandler } from './handler'

export const handlerPublishNamespace: ControlMessageHandler<PublishNamespace> = async (client, msg) => {
  if (client.onNamespacePublished) {
    client.onNamespacePublished(msg)
  }
}
