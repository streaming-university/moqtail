import {
  handlerPublishNamespace,
  handlerPublishNamespaceCancel,
  handlerPublishNamespaceDone,
  handlerPublishNamespaceError,
  handlerPublishNamespaceOk,
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
  handlerTrackStatusError,
  handlerTrackStatusOk,
  handlerUnsubscribe,
  handlerUnsubscribeAnnounces,
  handlerFetch,
  handlerFetchCancel,
  handlerFetchError,
  handlerFetchOk,
  handlerGoAway,
} from '.'
import {
  PublishNamespace,
  PublishNamespaceCancel,
  PublishNamespaceDone,
  PublishNamespaceError,
  PublishNamespaceOk,
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
  TrackStatusError,
  TrackStatusOk,
  Unsubscribe,
  UnsubscribeAnnounces,
} from '../../model/control'
import { MOQtailClient } from '../client'
import { ControlMessage } from '../../model/control'

export type ControlMessageHandler<T> = (client: MOQtailClient, msg: T) => Promise<void>

export function getHandlerForControlMessage(msg: ControlMessage): ControlMessageHandler<any> | undefined {
  if (msg instanceof PublishNamespace) return handlerPublishNamespace
  if (msg instanceof PublishNamespaceCancel) return handlerPublishNamespaceCancel
  if (msg instanceof PublishNamespaceDone) return handlerPublishNamespaceDone
  if (msg instanceof PublishNamespaceError) return handlerPublishNamespaceError
  if (msg instanceof PublishNamespaceOk) return handlerPublishNamespaceOk
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
  if (msg instanceof TrackStatusError) return handlerTrackStatusError
  if (msg instanceof TrackStatusOk) return handlerTrackStatusOk
  if (msg instanceof Unsubscribe) return handlerUnsubscribe
  if (msg instanceof UnsubscribeAnnounces) return handlerUnsubscribeAnnounces
  return undefined
}
