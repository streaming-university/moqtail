import { TrackStatus, TrackStatusError, TrackStatusOk } from '../../model/control'
import { ControlMessageHandler } from './handler'

export const handlerTrackStatus: ControlMessageHandler<TrackStatus> = async (_client, _msg) => {
  // TODO: Implement TrackStatus handler logic
}

export const handlerTrackStatusError: ControlMessageHandler<TrackStatusError> = async (_client, _msg) => {
  // TODO: Implement TrackStatus handler logic
}

export const handlerTrackStatusOk: ControlMessageHandler<TrackStatusOk> = async (_client, _msg) => {
  // TODO: Implement TrackStatus handler logic
}
