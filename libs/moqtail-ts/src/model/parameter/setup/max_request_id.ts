import { KeyValuePair } from '../../common/pair'
import { SetupParameterType } from '../constant'
import { Parameter } from '../parameter'

export class MaxRequestId implements Parameter {
  static readonly TYPE = SetupParameterType.MaxRequestId
  constructor(public readonly maxId: bigint) {}

  toKeyValuePair(): KeyValuePair {
    return KeyValuePair.tryNewVarInt(MaxRequestId.TYPE, this.maxId)
  }

  static fromKeyValuePair(pair: KeyValuePair): MaxRequestId | undefined {
    if (Number(pair.typeValue) !== MaxRequestId.TYPE || typeof pair.value !== 'bigint') return undefined
    return new MaxRequestId(pair.value)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest

  describe('MaxRequestId', () => {
    test('fromKeyValuePair returns instance for valid pair', () => {
      const pair = new MaxRequestId(42n).toKeyValuePair()
      const param = MaxRequestId.fromKeyValuePair(pair)
      expect(param).toBeInstanceOf(MaxRequestId)
      expect(param?.maxId).toBe(42n)
    })
    test('fromKeyValuePair returns undefined for wrong type', () => {
      const pair = KeyValuePair.tryNewVarInt(SetupParameterType.MaxAuthTokenCacheSize, 42n)
      const param = MaxRequestId.fromKeyValuePair(pair)
      expect(param).toBeUndefined()
    })
  })
}
