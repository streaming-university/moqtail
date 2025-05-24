import { ProtocolViolationError } from '@/model/error'
import { AnnounceError } from '../../model/control'
import { ControlMessageHandler } from './handler'
import { AnnounceRequest } from '../request/announce'

export const handlerAnnounceError: ControlMessageHandler<AnnounceError> = async (client, msg) => {
  const request = client.requests.get(msg.requestId)
  if (request instanceof AnnounceRequest) {
    request.resolve(msg)
  } else {
    throw new ProtocolViolationError('handlerAnnounceError', 'No announce request was found with the given request id')
  }
}
