import { ProtocolViolationError } from '@/model'
import { SubscribeUpdate } from '../../model/control'
import { ControlMessageHandler } from './handler'
import { SubscribePublication } from '../publication/subscribe'

export const handlerSubscribeUpdate: ControlMessageHandler<SubscribeUpdate> = async (client, msg) => {
  const publication = client.publications.get(msg.requestId)
  if (publication instanceof SubscribePublication) {
    publication.update(msg)
  } else {
    throw new ProtocolViolationError('handlerSubscribeUpdate', 'No subscribe request found for the given request id')
  }
}
