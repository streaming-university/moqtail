import { ProtocolViolationError, Unsubscribe } from '@/model'
import { ControlMessageHandler } from './handler'
import { SubscribePublication } from '../publication/subscribe'

export const handlerUnsubscribe: ControlMessageHandler<Unsubscribe> = async (client, msg) => {
  const publication = client.publications.get(msg.requestId)
  if (publication instanceof SubscribePublication) {
    publication.cancel()
  } else {
    throw new ProtocolViolationError('handlerUnsubscribe', 'No subscribe request found for the given request id')
  }
}
