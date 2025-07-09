import { ProtocolViolationError } from '@/model/error'
import { FetchError } from '../../model/control'
import { FetchRequest } from '../request/fetch'
import { ControlMessageHandler } from './handler'

export const handlerFetchError: ControlMessageHandler<FetchError> = async (client, msg) => {
  const request = client.requests.get(msg.requestId)
  if (request instanceof FetchRequest) {
    request.resolve(msg)
    client.requests.delete(msg.requestId)
  } else {
    throw new ProtocolViolationError(
      'handlerFetchError',
      `No fetch request was found with the given request id: ${msg.requestId}`,
    )
  }
}
