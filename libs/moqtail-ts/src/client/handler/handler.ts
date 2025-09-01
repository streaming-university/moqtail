import {
  handlerAnnounce,
  handlerAnnounceCancel,
  handlerMaxRequestId,
  handlerRequestsBlocked,
  handlerSubscribe,
  handlerSubscribeAnnounces,
  handlerSubscribeAnnouncesError,
  handlerSubscribeAnnouncesOk,
  handlerSubscribeDone,
  handlerSubscribeError,
  handlerSubscribeOk,
  handlerSubscribeUpdate,
  handlerTrackStatus,
  handlerTrackStatusRequest,
  handlerUnannounce,
  handlerUnsubscribe,
  handlerUnsubscribeAnnounces,
  handlerAnnounceError,
  handlerAnnounceOk,
  handlerFetch,
  handlerFetchCancel,
  handlerFetchError,
  handlerFetchOk,
  handlerGoAway,
} from '.'
import {
  Announce,
  AnnounceCancel,
  AnnounceError,
  AnnounceOk,
  Fetch,
  FetchCancel,
  FetchError,
  FetchOk,
  GoAway,
  MaxRequestId,
  RequestsBlocked,
  Subscribe,
  SubscribeAnnounces,
  SubscribeAnnouncesError,
  SubscribeAnnouncesOk,
  SubscribeDone,
  SubscribeError,
  SubscribeOk,
  SubscribeUpdate,
  TrackStatus,
  TrackStatusRequestMessage,
  Unannounce,
  Unsubscribe,
  UnsubscribeAnnounces,
} from '../../model/control'
import { MOQtailClient } from '../client'
import { ControlMessage } from '../../model/control'

export type ControlMessageHandler<T> = (client: MOQtailClient, msg: T) => Promise<void>

export function getHandlerForControlMessage(msg: ControlMessage): ControlMessageHandler<any> | undefined {
  if (msg instanceof Announce) return handlerAnnounce
  if (msg instanceof AnnounceCancel) return handlerAnnounceCancel
  if (msg instanceof AnnounceError) return handlerAnnounceError
  if (msg instanceof AnnounceOk) return handlerAnnounceOk
  if (msg instanceof Fetch) return handlerFetch
  if (msg instanceof FetchCancel) return handlerFetchCancel
  if (msg instanceof FetchError) return handlerFetchError
  if (msg instanceof FetchOk) return handlerFetchOk
  if (msg instanceof GoAway) return handlerGoAway
  if (msg instanceof MaxRequestId) return handlerMaxRequestId
  if (msg instanceof Subscribe) return handlerSubscribe
  if (msg instanceof SubscribeAnnounces) return handlerSubscribeAnnounces
  if (msg instanceof SubscribeAnnouncesError) return handlerSubscribeAnnouncesError
  if (msg instanceof SubscribeAnnouncesOk) return handlerSubscribeAnnouncesOk
  if (msg instanceof SubscribeDone) return handlerSubscribeDone
  if (msg instanceof SubscribeError) return handlerSubscribeError
  if (msg instanceof SubscribeOk) return handlerSubscribeOk
  if (msg instanceof SubscribeUpdate) return handlerSubscribeUpdate
  if (msg instanceof RequestsBlocked) return handlerRequestsBlocked
  if (msg instanceof TrackStatus) return handlerTrackStatus
  if (msg instanceof TrackStatusRequestMessage) return handlerTrackStatusRequest
  if (msg instanceof Unannounce) return handlerUnannounce
  if (msg instanceof Unsubscribe) return handlerUnsubscribe
  if (msg instanceof UnsubscribeAnnounces) return handlerUnsubscribeAnnounces
  return undefined
}
