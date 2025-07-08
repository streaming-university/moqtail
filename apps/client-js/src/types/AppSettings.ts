export interface AppSettings {
  relayUrl: string
  wsUrl: string
  wsPath: string
  posthog_host: string
  posthog_code: string
  videoEncoderConfig: VideoEncoderConfig
  audioEncoderConfig: AudioEncoderConfig
  videoDecoderConfig: VideoDecoderConfig
  audioDecoderConfig: AudioDecoderConfig
  keyFrameInterval: 'auto' | number
  clockNormalizationConfig: {
    timeServerUrl: string
    numberOfSamples: number
  }
  playoutBufferConfig: {
    targetLatencyMs: number
    maxLatencyMs: number
  }
}
