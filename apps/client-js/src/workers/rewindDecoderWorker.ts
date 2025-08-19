import {
  ExtensionHeader,
  ExtensionHeaders,
} from '../../../../libs/moqtail-ts/src/model/extension_header/extension_header'

let ctx: OffscreenCanvasRenderingContext2D | null = null
let videoDecoder: VideoDecoder | null = null
let audioDecoder: AudioDecoder | null = null
let waitingForKeyframe = true
let theDecoderConfig: VideoDecoderConfig | null = null

self.onmessage = (e) => {
  console.log('Rewind worker received message:', e.data.type)
  const { type, canvas, payload, extentions, decoderConfig } = e.data

  if (type === 'init') {
    ctx = canvas?.getContext?.('2d') ?? null
    theDecoderConfig = decoderConfig || null
    console.log('Rewind worker initialized with canvas:', !!ctx, 'decoder config:', !!theDecoderConfig)
    console.log('Decoder config details:', theDecoderConfig)

    // Send confirmation back to main thread
    self.postMessage({ type: 'initialized', hasCanvas: !!ctx, hasDecoderConfig: !!theDecoderConfig })
    return
  }

  if (type === 'reset') {
    waitingForKeyframe = true
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

  if (type === 'clear') {
    console.log('Rewind decoder worker: Clearing canvas and resetting state')

    // Clear the canvas to remove stale frames
    if (ctx) {
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      console.log('Rewind decoder worker: Canvas cleared')
    }

    // Reset decoder state
    waitingForKeyframe = true

    // Reset video decoder
    if (videoDecoder) {
      try {
        videoDecoder.reset()
        console.log('Rewind decoder worker: Video decoder reset')
      } catch (e) {
        console.warn('Rewind decoder worker: Error resetting video decoder:', e)
        try {
          videoDecoder.close()
          videoDecoder = null
        } catch (closeError) {
          // ignore close errors
        }
      }
    }

    // Reset audio decoder
    if (audioDecoder) {
      try {
        audioDecoder.reset()
        console.log('Rewind decoder worker: Audio decoder reset')
      } catch (e) {
        console.warn('Rewind decoder worker: Error resetting audio decoder:', e)
        try {
          audioDecoder.close()
          audioDecoder = null
        } catch (closeError) {
          // ignore close errors
        }
      }
    }

    self.postMessage({ type: 'clear-complete' })
    return
  }

  if (type === 'moq') {
    const moqtObj = payload
    const extensionHeaders = extentions

    console.log(
      'Rewind worker received video frame, payload size:',
      moqtObj?.payload?.length,
      'headers:',
      extensionHeaders?.length,
    )

    try {
      // Safely parse extension headers with error handling
      let headers: ExtensionHeader[] = []
      let timestamp = 0
      let configHeader: ExtensionHeader | undefined = undefined
      let isKey = false

      if (extensionHeaders && Array.isArray(extensionHeaders)) {
        try {
          headers = ExtensionHeaders.fromKeyValuePairs(extensionHeaders)
          timestamp = Number(headers.find((h) => ExtensionHeader.isCaptureTimestamp(h))?.timestamp ?? 0n)
          configHeader = headers.find((h) => ExtensionHeader.isVideoConfig(h))
          isKey = headers.some((h) => ExtensionHeader.isVideoFrameMarking(h) && h.value === 1n)
        } catch (headerError) {
          console.warn('Error parsing extension headers in rewind worker:', headerError)
          // Fallback: assume it's a key frame if we can't parse headers
          isKey = true
          timestamp = Date.now()
        }
      } else {
        console.warn('No valid extension headers found, using defaults')
        isKey = true
        timestamp = Date.now()
      }

      console.log('Rewind worker processing video frame:')
      console.log('  - Timestamp:', timestamp)
      console.log('  - Is keyframe:', isKey)
      console.log('  - Has config header:', !!configHeader)
      console.log('  - Payload size:', moqtObj?.payload?.length)
      console.log('  - Current video decoder:', !!videoDecoder, 'state:', videoDecoder?.state)

      if ((configHeader || isKey) && !videoDecoder && theDecoderConfig) {
        console.log('Creating new video decoder with config:', theDecoderConfig)
        videoDecoder = new VideoDecoder({
          output: handleFrame,
          error: (error) => {
            console.error('Video decoder error:', error)
            self.postMessage({ type: 'error', message: 'Video decoder error: ' + error.message })
          },
        })

        const videoDecoderConfig = theDecoderConfig
        if (configHeader?.config) {
          console.log('Adding config from header, size:', configHeader.config.length)
          videoDecoderConfig.description = configHeader.config
        }
        console.log('Configuring video decoder with:', videoDecoderConfig)
        videoDecoder.configure(videoDecoderConfig)
        console.log('Video decoder configured, state:', videoDecoder.state)
      }

      if (!videoDecoder || videoDecoder.state !== 'configured') {
        console.warn('Video decoder not configured, state:', videoDecoder?.state)
        return
      }

      if (waitingForKeyframe && !isKey) {
        console.warn('Waiting for key frame, skipping delta frame')
        return
      }

      if (isKey) {
        waitingForKeyframe = false
      }

      if (!moqtObj?.payload || moqtObj.payload.length === 0) {
        console.warn('No payload data available for video frame')
        return
      }

      const chunk = new EncodedVideoChunk({
        timestamp,
        type: isKey ? 'key' : 'delta',
        data: new Uint8Array(moqtObj.payload),
      })

      console.log(
        'Attempting to decode video chunk, type:',
        isKey ? 'key' : 'delta',
        'timestamp:',
        timestamp,
        'data size:',
        chunk.byteLength,
      )
      videoDecoder.decode(chunk)
      console.log('Video chunk queued for decoding successfully')
    } catch (decodeError) {
      console.error('Error in rewind worker video processing:', decodeError)
      let errorMessage = 'Decode error'
      if (decodeError instanceof Error) {
        errorMessage += ': ' + decodeError.message
      } else if (typeof decodeError === 'string') {
        errorMessage += ': ' + decodeError
      }
      self.postMessage({ type: 'error', message: errorMessage })
    }
  }

  if (type === 'moq-audio') {
    const moqtObj = payload
    const extensionHeaders = extentions

    console.log(
      'Rewind worker received audio frame, payload size:',
      moqtObj?.payload?.length,
      'headers:',
      extensionHeaders?.length,
    )

    try {
      // Parse timestamp from extension headers, similar to video
      let timestamp = 0
      if (extensionHeaders && Array.isArray(extensionHeaders)) {
        try {
          const headers = ExtensionHeaders.fromKeyValuePairs(extensionHeaders)
          timestamp = Number(headers.find((h) => ExtensionHeader.isCaptureTimestamp(h))?.timestamp ?? 0n)
        } catch (headerError) {
          console.warn('Error parsing audio extension headers in rewind worker:', headerError)
          timestamp = Date.now() // Fallback to current time
        }
      } else {
        timestamp = Date.now() // Fallback if no headers
      }

      if (!audioDecoder) {
        audioDecoder = new AudioDecoder({
          output: (frame) => {
            try {
              const pcm = new Float32Array(frame.numberOfFrames * frame.numberOfChannels)
              frame.copyTo(pcm, { planeIndex: 0 })
              self.postMessage({
                type: 'audio',
                samples: Array.from(pcm),
                sampleRate: frame.sampleRate,
              })
              frame.close()
            } catch (audioOutputError) {
              console.error('Error processing audio output:', audioOutputError)
            }
          },
          error: (error) => {
            console.error('Audio decoder error:', error)
            self.postMessage({ type: 'error', message: 'Audio decoder error: ' + error.message })
          },
        })
        audioDecoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 })
        console.log('Audio decoder configured for rewind playback')
      }

      if (!moqtObj?.payload || moqtObj.payload.length === 0) {
        console.warn('No payload data available for audio frame')
        return
      }

      const chunk = new EncodedAudioChunk({
        timestamp: timestamp, // Use proper timestamp from headers
        type: 'key',
        data: new Uint8Array(moqtObj.payload),
      })

      console.log('Audio chunk queued for decoding, size:', chunk.byteLength, 'timestamp:', timestamp)
      audioDecoder.decode(chunk)
    } catch (decodeError) {
      console.error('Error decoding audio chunk in rewind worker:', decodeError)
      self.postMessage({
        type: 'error',
        message: 'Audio decode error: ' + (decodeError instanceof Error ? decodeError.message : String(decodeError)),
      })
    }
  }

  function handleFrame(frame: VideoFrame) {
    console.log('Rewind worker handling frame:', frame.displayWidth, 'x', frame.displayHeight, 'ctx:', !!ctx)
    try {
      if (!ctx) {
        console.warn('No canvas context available')
        frame.close()
        return
      }
      const targetWidth = 1280
      const targetHeight = 720
      if (ctx.canvas.width !== targetWidth || ctx.canvas.height !== targetHeight) {
        ctx.canvas.width = targetWidth
        ctx.canvas.height = targetHeight
        console.log('Canvas resized to:', targetWidth, 'x', targetHeight)
      }
      // Clear with a different color to make it obvious when frames are being drawn
      ctx.fillStyle = '#ff0000' // Red background to show frame updates
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
      console.log('Frame drawn to canvas at position:', dx, dy, 'size:', dw, dh)

      // Send confirmation back to main thread
      self.postMessage({ type: 'frame-decoded', width: dw, height: dh })
    } catch (error) {
      console.error('Error handling video frame:', error)
      self.postMessage({
        type: 'error',
        message: 'Frame handling error: ' + (error instanceof Error ? error.message : String(error)),
      })
    } finally {
      if (frame && typeof frame.close === 'function') {
        frame.close()
      }
    }
  }
}
