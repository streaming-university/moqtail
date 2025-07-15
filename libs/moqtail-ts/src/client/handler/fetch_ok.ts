import { ProtocolViolationError } from '@/model/error'
import { FetchOk } from '../../model/control'
import { FetchRequest } from '../request/fetch'
import { ControlMessageHandler } from './handler'

export const handlerFetchOk: ControlMessageHandler<FetchOk> = async (client, msg) => {
  const request = client.requests.get(msg.requestId)
  if (request instanceof FetchRequest) {
    request.resolve(msg)
  } else {
    throw new ProtocolViolationError(
      'handlerFetchOk',
      `No fetch request was found with the given request id: ${msg.requestId}`,
    )
  }
}
