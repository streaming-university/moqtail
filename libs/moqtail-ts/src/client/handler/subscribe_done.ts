import { ProtocolViolationError } from '@/model/error'
import { SubscribeDone } from '../../model/control'
import { ControlMessageHandler } from './handler'
import { SubscribeRequest } from '../request/subscribe'

export const handlerSubscribeDone: ControlMessageHandler<SubscribeDone> = async (client, msg) => {
  const request = client.requests.get(msg.requestId)
  if (request instanceof SubscribeRequest) {
    request.expectedStreams = msg.streamCount
  } else {
    throw new ProtocolViolationError('handlerSubscribeDone', 'No subscribe request was found with the given request id')
  }
}
