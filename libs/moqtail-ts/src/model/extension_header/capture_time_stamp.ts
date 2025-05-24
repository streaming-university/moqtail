import { KeyValuePair } from '../common/pair'
import { LOCHeaderExtensionId } from './constant'

export class CaptureTimestamp {
  static readonly TYPE = LOCHeaderExtensionId.CaptureTimestamp
  constructor(public readonly timestamp: bigint) {}

  toKeyValuePair(): KeyValuePair {
    return KeyValuePair.tryNewVarInt(CaptureTimestamp.TYPE, this.timestamp)
  }

  static fromKeyValuePair(pair: KeyValuePair): CaptureTimestamp | undefined {
    const type = Number(pair.typeValue)
    if (type === CaptureTimestamp.TYPE && typeof pair.value === 'bigint') {
      return new CaptureTimestamp(pair.value)
    }
    return undefined
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('CaptureTimestampExtensionHeader', () => {
    test('should roundtrip CaptureTimestamp', () => {
      const value = 1234567890123456789n
      const pair = new CaptureTimestamp(value).toKeyValuePair()
      const header = CaptureTimestamp.fromKeyValuePair(pair)
      expect(header).toBeInstanceOf(CaptureTimestamp)
      expect(header?.timestamp).toBe(value)
    })
  })
}
