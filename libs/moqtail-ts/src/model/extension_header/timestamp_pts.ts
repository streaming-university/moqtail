import { KeyValuePair } from '../common/pair'
import { LOCHeaderExtensionId } from './constant'

export class TimestampPts {
  static readonly TYPE = LOCHeaderExtensionId.TimestampPts
  constructor(public readonly timestamp: bigint) {}

  toKeyValuePair(): KeyValuePair {
    return KeyValuePair.tryNewVarInt(TimestampPts.TYPE, this.timestamp)
  }

  static fromKeyValuePair(pair: KeyValuePair): TimestampPts | undefined {
    const type = Number(pair.typeValue)
    if (type === TimestampPts.TYPE && typeof pair.value === 'bigint') {
      return new TimestampPts(pair.value)
    }
    return undefined
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('TimestampPtsExtensionHeader', () => {
    test('should roundtrip TimestampPts', () => {
      const value = 1234567890123456789n
      const pair = new TimestampPts(value).toKeyValuePair()
      const header = TimestampPts.fromKeyValuePair(pair)
      expect(header).toBeInstanceOf(TimestampPts)
      expect(header?.timestamp).toBe(value)
    })
  })
}
