import {
  ExtensionHeader,
  ExtensionHeaders,
} from '../../../../libs/moqtail-ts/src/model/extension_header/extension_header'
import { ClockNormalizer } from '../../../../libs/moqtail-ts/src/util/clock_normalizer'

let ctx: OffscreenCanvasRenderingContext2D | null = null
let videoDecoder: VideoDecoder | null = null
let audioDecoder: AudioDecoder | null = null
let waitingForKeyframe = true
let clockNormalizer: ClockNormalizer | null = null
let theDecoderConfig: VideoDecoderConfig | null = null
let frameTimeoutId: ReturnType<typeof setTimeout> | null = null
const FRAME_TIMEOUT_MS = 300 // Clear canvas if no frames for 00ms

self.onmessage = async (e) => {
  const { type, canvas, payload, extentions, decoderConfig } = e.data

  if (type === 'init') {
    ctx = canvas?.getContext?.('2d') ?? null
    theDecoderConfig = decoderConfig || null

    // Create ClockNormalizer instance for this worker
    try {
      clockNormalizer = await ClockNormalizer.create()
    } catch (error) {
      console.error('Failed to create clock normalizer in worker:', error)
      clockNormalizer = null
    }
    return
  }

  if (type === 'reset') {
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
        // ignore reset errors
      }
    }
    if (audioDecoder) {
      try {
        audioDecoder.reset()
      } catch (e) {
        // ignore reset errors
      }
    }
    return
  }

  if (type === 'moq') {
    const moqtObj = payload
    const extensionHeaders = extentions

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
    }, FRAME_TIMEOUT_MS)

    if ((configHeader || isKey) && !videoDecoder && theDecoderConfig) {
      videoDecoder = new VideoDecoder({
        output: handleFrame,
        error: console.error,
      })

      const videoDecoderConfig = theDecoderConfig
      console.log('Using video decoder config:', videoDecoderConfig)
      if (configHeader?.config) {
        videoDecoderConfig.description = configHeader.config
      }
      videoDecoder.configure(videoDecoderConfig)
    }

    if (!videoDecoder || videoDecoder.state !== 'configured') return

    if (waitingForKeyframe && !isKey) {
      console.warn('Waiting for key frame, skipping delta frame')
      return
    }

    if (isKey) {
      waitingForKeyframe = false
    }
    const chunk = new EncodedVideoChunk({
      timestamp,
      type: isKey ? 'key' : 'delta',
      data: new Uint8Array(moqtObj.payload),
    })

    try {
      videoDecoder.decode(chunk)
    } catch (decodeError) {
      console.error('Error decoding video chunk:', decodeError)
    }

    if (clockNormalizer !== null && timestamp !== 0) {
      const arrivalTime = Math.round(Date.now())
      const captureTimeLocal = Math.round(timestamp)
      self.postMessage({ type: 'video-latency', value: arrivalTime - captureTimeLocal })
    }

    self.postMessage({ type: 'video-throughput', value: moqtObj.payload.length })
  }

  if (type === 'moq-audio') {
    const moqtObj = payload
    const extensionHeaders = extentions

    const headers = ExtensionHeaders.fromKeyValuePairs(extensionHeaders ?? [])
    const timestamp = Number(headers.find((h) => ExtensionHeader.isCaptureTimestamp(h))?.timestamp ?? 0n)

    if (!audioDecoder) {
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
        error: console.error,
      })
      audioDecoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 })
    }
    const chunk = new EncodedAudioChunk({
      timestamp: 0 /* extract from headers or set to 0 */,
      type: 'key', // or 'delta' if you can distinguish
      data: new Uint8Array(moqtObj.payload),
    })
    audioDecoder.decode(chunk)

    if (clockNormalizer !== null && timestamp !== 0) {
      // Use local time for arrival, server time (timestamp) for capture
      // This gives us the actual network + processing latency
      const arrivalTime = Math.round(Date.now())
      const captureTimeLocal = Math.round(timestamp)
      self.postMessage({ type: 'audio-latency', value: arrivalTime - captureTimeLocal })
    }

    // Send throughput data for audio (payload size)
    self.postMessage({ type: 'audio-throughput', value: moqtObj.payload.length })
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
