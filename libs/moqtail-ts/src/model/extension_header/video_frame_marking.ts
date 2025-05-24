import { KeyValuePair } from '../common/pair'
import { LOCHeaderExtensionId } from './constant'

export class VideoFrameMarking {
  static readonly TYPE = LOCHeaderExtensionId.VideoFrameMarking
  constructor(public readonly value: bigint) {}

  toKeyValuePair(): KeyValuePair {
    return KeyValuePair.tryNewVarInt(VideoFrameMarking.TYPE, this.value)
  }

  static fromKeyValuePair(pair: KeyValuePair): VideoFrameMarking | undefined {
    const type = Number(pair.typeValue)
    if (type === VideoFrameMarking.TYPE && typeof pair.value === 'bigint') {
      return new VideoFrameMarking(pair.value)
    }
    return undefined
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('VideoFrameMarkingExtensionHeader', () => {
    test('should roundtrip VideoFrameMarking', () => {
      const value = 9876543210987654321n
      const pair = new VideoFrameMarking(value).toKeyValuePair()
      const header = VideoFrameMarking.fromKeyValuePair(pair)
      expect(header).toBeInstanceOf(VideoFrameMarking)
      expect(header?.value).toBe(value)
    })
  })
}
