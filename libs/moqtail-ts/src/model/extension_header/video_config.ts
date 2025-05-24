import { KeyValuePair } from '../common/pair'
import { LOCHeaderExtensionId } from './constant'

export class VideoConfig {
  static readonly TYPE = LOCHeaderExtensionId.VideoConfig
  constructor(public readonly config: Uint8Array) {}

  toKeyValuePair(): KeyValuePair {
    return KeyValuePair.tryNewBytes(VideoConfig.TYPE, this.config)
  }

  static fromKeyValuePair(pair: KeyValuePair): VideoConfig | undefined {
    const type = Number(pair.typeValue)
    if (type === VideoConfig.TYPE && pair.value instanceof Uint8Array) {
      return new VideoConfig(pair.value)
    }
    return undefined
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('VideoConfigExtensionHeader', () => {
    test('should roundtrip VideoConfig', () => {
      const value = new Uint8Array([1, 2, 3, 4])
      const pair = new VideoConfig(value).toKeyValuePair()
      const header = VideoConfig.fromKeyValuePair(pair)
      expect(header).toBeInstanceOf(VideoConfig)
      expect(header?.config).toBeInstanceOf(Uint8Array)
      expect(Array.from(header!.config)).toEqual(Array.from(value))
    })
  })
}
