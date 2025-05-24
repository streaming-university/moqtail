import { KeyValuePair } from '../../common/pair'
import { VersionSpecificParameterType } from '../constant'
import { Parameter } from '../parameter'

export class DeliveryTimeout implements Parameter {
  static readonly TYPE = VersionSpecificParameterType.DeliveryTimeout
  constructor(public readonly objectTimeout: bigint) {}

  toKeyValuePair(): KeyValuePair {
    return KeyValuePair.tryNewVarInt(DeliveryTimeout.TYPE, this.objectTimeout)
  }

  static fromKeyValuePair(pair: KeyValuePair): DeliveryTimeout | undefined {
    if (Number(pair.typeValue) !== DeliveryTimeout.TYPE || typeof pair.value !== 'bigint') return undefined
    return new DeliveryTimeout(pair.value)
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest

  describe('DeliveryTimeout', () => {
    test('fromKeyValuePair returns instance for valid pair', () => {
      const pair = new DeliveryTimeout(1000000n).toKeyValuePair()
      const param = DeliveryTimeout.fromKeyValuePair(pair)
      expect(param).toBeInstanceOf(DeliveryTimeout)
      expect(param?.objectTimeout).toBe(1000000n)
    })
    test('fromKeyValuePair returns undefined for wrong type', () => {
      const pair = KeyValuePair.tryNewVarInt(8, 55n)
      const param = DeliveryTimeout.fromKeyValuePair(pair)
      expect(param).toBeUndefined()
    })
  })
}
