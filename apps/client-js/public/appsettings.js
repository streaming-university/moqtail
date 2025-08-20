window.appSettings = {
  relayUrl: 'https://localhost:4433',
  wsUrl: 'http://localhost:3001',
  wsPath: '/ws',
  posthog_host: 'https://eu.i.posthog.com',
  posthog_code: '***',
  videoEncoderConfig: {
    codec: 'avc1.42E01E',
    width: 640,
    height: 360,
    bitrate: 300_000,
    framerate: 25,
    latencyMode: 'realtime',
    hardwareAcceleration: 'prefer-software',
  },
  videoDecoderConfig: {
    codec: 'avc1.42E01E',
    optimizeForLatency: true,
    hardwareAcceleration: 'prefer-software',
  },
  audioEncoderConfig: {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 1,
    bitrate: 48_000,
  },
  audioDecoderConfig: {
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 1,
    bitrate: 48_000,
  },
  keyFrameInterval: 50,
  clockNormalizationConfig: {
    timeServerUrl: 'https://time.akamai.com/?ms',
    numberOfSamples: 5,
  },
  playoutBufferConfig: {
    targetLatencyMs: 100,
    maxLatencyMs: 1000,
  },
  frameTimeoutMs: 1000,
}
