import { KeyValuePair } from '../common/pair'
import { CaptureTimestamp } from './capture_time_stamp'
import { VideoFrameMarking } from './video_frame_marking'
import { AudioLevel } from './audio_level'
import { VideoConfig } from './video_config'

export type ExtensionHeader = CaptureTimestamp | VideoFrameMarking | AudioLevel | VideoConfig

export namespace ExtensionHeader {
  export function fromKeyValuePair(pair: KeyValuePair): ExtensionHeader | undefined {
    return (
      CaptureTimestamp.fromKeyValuePair(pair) ||
      VideoFrameMarking.fromKeyValuePair(pair) ||
      AudioLevel.fromKeyValuePair(pair) ||
      VideoConfig.fromKeyValuePair(pair)
    )
  }

  export function toKeyValuePair(header: ExtensionHeader): KeyValuePair {
    return header.toKeyValuePair()
  }

  export function isCaptureTimestamp(header: ExtensionHeader): header is CaptureTimestamp {
    return header instanceof CaptureTimestamp
  }
  export function isVideoFrameMarking(header: ExtensionHeader): header is VideoFrameMarking {
    return header instanceof VideoFrameMarking
  }
  export function isAudioLevel(header: ExtensionHeader): header is AudioLevel {
    return header instanceof AudioLevel
  }
  export function isVideoConfig(header: ExtensionHeader): header is VideoConfig {
    return header instanceof VideoConfig
  }
}

export class ExtensionHeaders {
  private kvps: KeyValuePair[] = []

  addCaptureTimestamp(timestamp: bigint | number): this {
    this.kvps.push(new CaptureTimestamp(BigInt(timestamp)).toKeyValuePair())
    return this
  }
  addVideoFrameMarking(marking: bigint | number): this {
    this.kvps.push(new VideoFrameMarking(BigInt(marking)).toKeyValuePair())
    return this
  }
  addAudioLevel(audioLevel: bigint | number): this {
    this.kvps.push(new AudioLevel(BigInt(audioLevel)).toKeyValuePair())
    return this
  }
  addVideoConfig(config: Uint8Array): this {
    this.kvps.push(new VideoConfig(config).toKeyValuePair())
    return this
  }
  addRaw(pair: KeyValuePair): this {
    this.kvps.push(pair)
    return this
  }
  build(): KeyValuePair[] {
    return this.kvps
  }
  static fromKeyValuePairs(kvps: KeyValuePair[]): ExtensionHeader[] {
    const result: ExtensionHeader[] = []
    for (const kvp of kvps) {
      const parsed = ExtensionHeader.fromKeyValuePair(kvp)
      if (parsed) result.push(parsed)
    }
    return result
  }
}

if (import.meta.vitest) {
  const { describe, test, expect } = import.meta.vitest
  describe('ExtensionHeaders', () => {
    test('build and fromKeyValuePairs returns correct parameters', () => {
      const timestamp = 11223344n
      const marking = 99887766n
      const audioLevel = 99n
      const videoConfig = new Uint8Array([3, 1, 2, 4, 5, 6, 2, 5, 3])
      const kvps = new ExtensionHeaders()
        .addCaptureTimestamp(timestamp)
        .addVideoFrameMarking(marking)
        .addAudioLevel(audioLevel)
        .addVideoConfig(videoConfig)
        .build()
      const parsed = ExtensionHeaders.fromKeyValuePairs(kvps)
      expect(parsed.length).toBe(4)
      expect(parsed[0] && ExtensionHeader.isCaptureTimestamp(parsed[0]) && parsed[0].timestamp === timestamp).toBe(true)
      expect(parsed[1] && ExtensionHeader.isVideoFrameMarking(parsed[1]) && parsed[1].value === marking).toBe(true)
      expect(parsed[2] && ExtensionHeader.isAudioLevel(parsed[2]) && parsed[2].audioLevel === audioLevel).toBe(true)
      expect(parsed[3] && ExtensionHeader.isVideoConfig(parsed[3]) && parsed[3].config === videoConfig).toBe(true)
    })

    test('fromKeyValuePairs skips unknown parameter', () => {
      const unknown = KeyValuePair.tryNewVarInt(100, 31n)
      const timestamp = 5927836n
      const marking = 15938n
      const audioLevel = 99n
      const kvps = new ExtensionHeaders()
        .addCaptureTimestamp(timestamp)
        .addRaw(unknown)
        .addVideoFrameMarking(marking)
        .addAudioLevel(audioLevel)
        .build()
      const parsed = ExtensionHeaders.fromKeyValuePairs(kvps)
      expect(parsed.length).toBe(3)
      expect(parsed[0] && ExtensionHeader.isCaptureTimestamp(parsed[0]) && parsed[0].timestamp === timestamp).toBe(true)
      expect(parsed[1] && ExtensionHeader.isVideoFrameMarking(parsed[1]) && parsed[1].value === marking).toBe(true)
      expect(parsed[2] && ExtensionHeader.isAudioLevel(parsed[2]) && parsed[2].audioLevel === audioLevel).toBe(true)
    })
  })
}
