import { KeyValuePair } from '../common/pair'
import { LOCHeaderExtensionId } from './constant'

export class AudioLevel {
  static readonly TYPE = LOCHeaderExtensionId.AudioLevel
  constructor(public readonly audioLevel: bigint) {}

  toKeyValuePair(): KeyValuePair {
    return KeyValuePair.tryNewVarInt(AudioLevel.TYPE, this.audioLevel)
  }

  static fromKeyValuePair(pair: KeyValuePair): AudioLevel | undefined {
    const type = Number(pair.typeValue)
    if (type === AudioLevel.TYPE && typeof pair.value === 'bigint') {
      return new AudioLevel(pair.value)
    }
    return undefined
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('AudioLevelExtensionHeader', () => {
    test('should roundtrip AudioLevel', () => {
      const value = 42n
      const pair = new AudioLevel(value).toKeyValuePair()
      const header = AudioLevel.fromKeyValuePair(pair)
      expect(header).toBeInstanceOf(AudioLevel)
      expect(header?.audioLevel).toBe(value)
    })
  })
}
