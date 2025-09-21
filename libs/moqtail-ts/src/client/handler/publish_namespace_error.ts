import { ProtocolViolationError } from '@/model/error'
import { PublishNamespaceError } from '../../model/control'
import { ControlMessageHandler } from './handler'
import { PublishNamespaceRequest } from '../request/publish_namespace'

export const handlerPublishNamespaceError: ControlMessageHandler<PublishNamespaceError> = async (client, msg) => {
  const request = client.requests.get(msg.requestId)
  if (request instanceof PublishNamespaceRequest) {
    request.resolve(msg)
  } else {
    throw new ProtocolViolationError(
      'handlerPublishNamespaceError',
      'No announce request was found with the given request id',
    )
  }
}
