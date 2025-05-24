import { KeyValuePair } from '../common/pair'

export interface Parameter {
  toKeyValuePair(): KeyValuePair
}
