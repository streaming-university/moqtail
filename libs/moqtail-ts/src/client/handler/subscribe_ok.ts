import { ProtocolViolationError } from '@/model'
import { SubscribeOk } from '../../model/control'
import { SubscribeRequest } from '../request/subscribe'
import { ControlMessageHandler } from './handler'

export const handlerSubscribeOk: ControlMessageHandler<SubscribeOk> = async (client, msg) => {
  const request = client.requests.get(msg.requestId)
  console.warn('handlerSubscribeOk', 'Received subscribe ok', msg, request)
  if (request instanceof SubscribeRequest) {
    // TODO: use subscribe ok properties e.g expires, group order, largest location)
    request.resolve(msg)
  } else {
    throw new ProtocolViolationError('handlerSubscribeOk', 'No subscribe request was found with the given request id')
  }
}
