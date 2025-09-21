import { ProtocolViolationError } from '@/model/error'
import { PublishNamespaceOk } from '../../model/control'
import { PublishNamespaceRequest } from '../request/publish_namespace'
import { ControlMessageHandler } from './handler'

export const handlerPublishNamespaceOk: ControlMessageHandler<PublishNamespaceOk> = async (client, msg) => {
  const request = client.requests.get(msg.requestId)
  if (request instanceof PublishNamespaceRequest) {
    request.resolve(msg)
  } else {
    throw new ProtocolViolationError(
      'handlerPublishNamespaceOk',
      'No announce request was found with the given request id',
    )
  }
}
