import { ProtocolViolationError } from '@/model/error'
import { FetchCancel } from '../../model/control'
import { FetchPublication } from '../publication/fetch'
import { ControlMessageHandler } from './handler'

export const handlerFetchCancel: ControlMessageHandler<FetchCancel> = async (client, msg) => {
  const publication = client.publications.get(msg.requestId)
  if (publication instanceof FetchPublication) {
    publication.cancel()
  } else {
    throw new ProtocolViolationError('handlerFetchCancel', 'No fetch request found for the given request id')
  }
}
