import { KeyValuePair } from '../../common/pair'
import { SetupParameterType } from '../constant'
import { Parameter } from '../parameter'

export class MaxAuthTokenCacheSize implements Parameter {
  static readonly TYPE = SetupParameterType.MaxAuthTokenCacheSize
  constructor(public readonly maxSize: bigint) {}

  toKeyValuePair(): KeyValuePair {
    return KeyValuePair.tryNewVarInt(MaxAuthTokenCacheSize.TYPE, this.maxSize)
  }

  static fromKeyValuePair(pair: KeyValuePair): MaxAuthTokenCacheSize | undefined {
    if (Number(pair.typeValue) !== MaxAuthTokenCacheSize.TYPE || typeof pair.value !== 'bigint') return undefined
    return new MaxAuthTokenCacheSize(pair.value)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest

  describe('MaxAuthTokenCacheSize', () => {
    test('fromKeyValuePair returns instance for valid pair', () => {
      const pair = new MaxAuthTokenCacheSize(123n).toKeyValuePair()
      const param = MaxAuthTokenCacheSize.fromKeyValuePair(pair)
      expect(param).toBeInstanceOf(MaxAuthTokenCacheSize)
      expect(param?.maxSize).toBe(123n)
    })
    test('fromKeyValuePair returns undefined for wrong type', () => {
      const pair = KeyValuePair.tryNewVarInt(SetupParameterType.MaxRequestId, 123n)
      const param = MaxAuthTokenCacheSize.fromKeyValuePair(pair)
      expect(param).toBeUndefined()
    })
  })
}
