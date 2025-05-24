import { ProtocolViolationError } from '@/model/error'
import { SubscribeError } from '../../model/control'
import { SubscribeRequest } from '../request/subscribe'
import { ControlMessageHandler } from './handler'

export const handlerSubscribeError: ControlMessageHandler<SubscribeError> = async (client, msg) => {
  const request = client.requests.get(msg.requestId)
  if (request instanceof SubscribeRequest) {
    request.resolve(msg)
  } else {
    throw new ProtocolViolationError(
      'handlerSubscribeError',
      'No subscribe request was found with the given request id',
    )
  }
}
