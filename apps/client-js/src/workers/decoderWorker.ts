import {
  ExtensionHeader,
  ExtensionHeaders,
} from '../../../../libs/moqtail-ts/src/model/extension_header/extension_header'

let ctx: OffscreenCanvasRenderingContext2D | null = null
let videoDecoder: VideoDecoder | null = null
let audioDecoder: AudioDecoder | null = null
let waitingForKeyframe = true
let theDecoderConfig: VideoDecoderConfig | null = null
let frameTimeoutId: ReturnType<typeof setTimeout> | null = null

// Diagnostic counters
let videoFrameCount = 0
let audioFrameCount = 0
let lastLogTime = performance.now()
let moqObjectCount = 0

self.onmessage = async (e) => {
  const { type, canvas, payload, extentions, decoderConfig, serverTimestamp, frameTimeoutMs } = e.data

  if (type === 'init') {
    ctx = canvas?.getContext?.('2d') ?? null
    theDecoderConfig = decoderConfig || null

    // Create ClockNormalizer instance for this worker

    return
  }

  if (type === 'init-audio-only') {
    console.log('[DECODER] Initializing audio-only mode')
    theDecoderConfig = decoderConfig || null
    return
  }

  if (type === 'reset') {
    console.log('[DECODER] Resetting decoders at', new Date().toISOString())
    waitingForKeyframe = true
    if (frameTimeoutId) {
      clearTimeout(frameTimeoutId)
      frameTimeoutId = null
    }
    clearCanvas()
    if (videoDecoder) {
      try {
        videoDecoder.reset()
      } catch (e) {
        console.error('[DECODER] Error resetting video decoder:', e)
      }
    }
    if (audioDecoder) {
      try {
        audioDecoder.reset()
      } catch (e) {
        console.error('[DECODER] Error resetting audio decoder:', e)
      }
    }
    return
  }

  if (type === 'moq') {
    const moqtObj = payload
    const extensionHeaders = extentions

    moqObjectCount++
    if (moqObjectCount % 50 === 0) {
      console.log(`[WORKER] Received ${moqObjectCount} MoQ objects`)
    }

    //console.debug('[WORKER]Received the payload:', moqtObj)
    //console.debug('[WORKER]Received the extension headers:', extensionHeaders)
    const headers = ExtensionHeaders.fromKeyValuePairs(extensionHeaders ?? [])
    const timestamp = Number(headers.find((h) => ExtensionHeader.isCaptureTimestamp(h))?.timestamp ?? 0n)
    const configHeader = headers.find((h) => ExtensionHeader.isVideoConfig(h))
    const isKey = headers.some((h) => ExtensionHeader.isVideoFrameMarking(h) && h.value === 1n)

    if (frameTimeoutId) {
      clearTimeout(frameTimeoutId)
    }
    frameTimeoutId = setTimeout(() => {
      clearCanvas()
    }, frameTimeoutMs)

    if ((configHeader || isKey) && !videoDecoder && theDecoderConfig) {
      console.log('[DECODER] Creating new video decoder at', new Date().toISOString())
      videoDecoder = new VideoDecoder({
        output: handleFrame,
        error: (error) => {
          console.error('[DECODER] Video decoder error:', error, 'at', new Date().toISOString())
        },
      })

      const videoDecoderConfig = theDecoderConfig
      console.log('Using video decoder config:', videoDecoderConfig)
      if (configHeader?.config) {
        videoDecoderConfig.description = configHeader.config
      }
      videoDecoder.configure(videoDecoderConfig)
    }

    if (!videoDecoder || videoDecoder.state !== 'configured') {
      console.warn('[DECODER] Video decoder not ready, state:', videoDecoder?.state, 'at', new Date().toISOString())
      return
    }

    if (waitingForKeyframe && !isKey) {
      console.warn('[DECODER] Waiting for keyframe, skipping delta frame at', new Date().toISOString())
      return
    }

    if (isKey) {
      waitingForKeyframe = false
    }

    const start = performance.now()
    const chunk = new EncodedVideoChunk({
      timestamp,
      type: isKey ? 'key' : 'delta',
      data: new Uint8Array(moqtObj.payload),
    })

    try {
      videoDecoder.decode(chunk)
      videoFrameCount++

      const now = performance.now()
      if (now - lastLogTime > 10000) {
        console.log(
          `[DECODER] Video health check: ${videoFrameCount} frames processed, queue size: ${videoDecoder.decodeQueueSize}, state: ${videoDecoder.state}`,
        )
        lastLogTime = now
      }
    } catch (decodeError) {
      console.error('[DECODER] Video decode error:', decodeError, 'at', new Date().toISOString())
    }

    const end = performance.now()
    const decodingTime = end - start

    // Send consolidated video telemetry
    const glassLatency = serverTimestamp ? serverTimestamp + decodingTime - timestamp : 0
    self.postMessage({
      type: 'video-telemetry',
      latency: glassLatency,
      throughput: moqtObj.payload.length,
    })
  }

  if (type === 'moq-audio') {
    const moqtObj = payload
    const extensionHeaders = extentions

    const headers = ExtensionHeaders.fromKeyValuePairs(extensionHeaders ?? [])
    const timestamp = Number(headers.find((h) => ExtensionHeader.isCaptureTimestamp(h))?.timestamp ?? 0n)

    if (!audioDecoder) {
      console.log('[DECODER] Creating new audio decoder at', new Date().toISOString())
      audioDecoder = new AudioDecoder({
        output: (frame) => {
          const pcm = new Float32Array(frame.numberOfFrames * frame.numberOfChannels)
          frame.copyTo(pcm, { planeIndex: 0 })
          self.postMessage({
            type: 'audio',
            samples: Array.from(pcm),
            sampleRate: frame.sampleRate,
          })
          frame.close()
        },
        error: (error) => {
          console.error('[DECODER] Audio decoder error:', error, 'at', new Date().toISOString())
        },
      })
      audioDecoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 })
    }
    const start = performance.now()
    const chunk = new EncodedAudioChunk({
      timestamp: 0 /* extract from headers or set to 0 */,
      type: 'key', // or 'delta' if you can distinguish
      data: new Uint8Array(moqtObj.payload),
    })

    try {
      audioDecoder.decode(chunk)
      audioFrameCount++

      // Log audio health less frequently (every 1000 frames)
      if (audioFrameCount % 1000 === 0) {
        console.log(
          `[DECODER] Audio health: ${audioFrameCount} frames, queue: ${audioDecoder.decodeQueueSize}, state: ${audioDecoder.state}`,
        )
      }
    } catch (decodeError) {
      console.error('[DECODER] Audio decode error:', decodeError, 'at', new Date().toISOString())
    }

    const end = performance.now()
    const decodingTime = end - start

    // Send consolidated audio telemetry
    const glassLatency = serverTimestamp ? serverTimestamp + decodingTime - timestamp : 0
    self.postMessage({
      type: 'audio-telemetry',
      latency: glassLatency,
      throughput: moqtObj.payload.length,
    })
  }

  function handleFrame(frame: VideoFrame) {
    try {
      if (!ctx) {
        frame.close()
        return
      }
      const targetWidth = 640
      const targetHeight = 360
      if (ctx.canvas.width !== targetWidth || ctx.canvas.height !== targetHeight) {
        ctx.canvas.width = targetWidth
        ctx.canvas.height = targetHeight
      }
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, targetWidth, targetHeight)
      const videoW = frame.displayWidth || frame.codedWidth
      const videoH = frame.displayHeight || frame.codedHeight
      const canvasAR = targetWidth / targetHeight
      const videoAR = videoW / videoH
      let dw = targetWidth,
        dh = targetHeight,
        dx = 0,
        dy = 0
      if (videoAR > canvasAR) {
        dw = targetWidth
        dh = targetWidth / videoAR
        dy = (targetHeight - dh) / 2
      } else {
        dh = targetHeight
        dw = targetHeight * videoAR
        dx = (targetWidth - dw) / 2
      }
      ctx.drawImage(frame, 0, 0, videoW, videoH, dx, dy, dw, dh)
    } catch (error) {
      console.error('Error handling video frame:', error)
    } finally {
      // Always close the frame to prevent garbage collection warnings
      if (frame && typeof frame.close === 'function') {
        frame.close()
      }
    }
  }

  function clearCanvas() {
    if (ctx) {
      const targetWidth = 640
      const targetHeight = 360
      ctx.canvas.width = targetWidth
      ctx.canvas.height = targetHeight
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, targetWidth, targetHeight)
    }
  }

  if (type === 'clear') {
    clearCanvas()
    return
  }
}
