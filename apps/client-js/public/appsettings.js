window.appSettings = {
  relayUrl: 'https://localhost:4433',
  wsUrl: 'http://localhost:3001',
  wsPath: '/ws',
  posthog_host: 'https://eu.i.posthog.com',
  posthog_code: '***',
  videoEncoderConfig: {
    codec: 'av01.0.15M.08',
    width: 640,
    height: 360,
    bitrate: 300_000,
    framerate: 25,
    latencyMode: 'realtime',
    hardwareAcceleration: 'no-preference',
  },
  videoDecoderConfig: {
    codec: 'av01.0.15M.08',
    optimizeForLatency: true,
    hardwareAcceleration: 'no-preference',
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
  keyFrameInterval: 200,
  clockNormalizationConfig: {
    timeServerUrl: 'https://time.akamai.com/?ms',
    numberOfSamples: 5,
  },
  playoutBufferConfig: {
    targetLatencyMs: 100,
    maxLatencyMs: 1000,
  },
}
