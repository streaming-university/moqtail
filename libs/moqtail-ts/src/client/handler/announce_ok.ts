import { ProtocolViolationError } from '@/model/error'
import { AnnounceOk } from '../../model/control'
import { AnnounceRequest } from '../request/announce'
import { ControlMessageHandler } from './handler'

export const handlerAnnounceOk: ControlMessageHandler<AnnounceOk> = async (client, msg) => {
  const request = client.requests.get(msg.requestId)
  if (request instanceof AnnounceRequest) {
    request.resolve(msg)
  } else {
    throw new ProtocolViolationError('handlerAnnounceOk', 'No announce request was found with the given request id')
  }
}
