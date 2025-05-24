import {
  ExtensionHeader,
  ExtensionHeaders,
} from '../../../../libs/moqtail-ts/src/model/extension_header/extension_header'

let ctx: OffscreenCanvasRenderingContext2D | null = null
let videoDecoder: VideoDecoder | null = null
let audioDecoder: AudioDecoder | null = null
let waitingForKeyframe = true;
let akamaiOffset: number | null = null;

self.onmessage = (e) => {
  const { type, canvas, offset, payload, extentions } = e.data

  if (type === 'init') {
    ctx = canvas?.getContext?.('2d') ?? null
    akamaiOffset = offset
    return
  }

  if (type === 'reset') {
    waitingForKeyframe = true;
    if (videoDecoder) {
      try {
        videoDecoder.reset();
      } catch (e) {
        // ignore reset errors
      }
    }
    if (audioDecoder) {
      try {
        audioDecoder.reset();
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

    if (configHeader && !videoDecoder) {
      videoDecoder = new VideoDecoder({
        output: handleFrame,
        error: console.error,
      })
      videoDecoder.configure({
        codec: 'avc1.42E01E',
        description: configHeader.config,
        optimizeForLatency: true,
        hardwareAcceleration: 'prefer-software',
      })
    }

    if (!videoDecoder || videoDecoder.state !== 'configured') return

    const isKey = headers.some((h) => ExtensionHeader.isVideoFrameMarking(h) && h.value === 1n)

    if (waitingForKeyframe && !isKey) {
      console.warn('Waiting for key frame, skipping delta frame');
      return;
    }

    if (isKey) {
      waitingForKeyframe = false;
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

    if (akamaiOffset !== null && timestamp !== 0) {
      const arrivalTime = Math.round(performance.timeOrigin + performance.now() + akamaiOffset);
      self.postMessage({ type: 'latency', value: arrivalTime - timestamp });
    }

    self.postMessage({ type: 'throughput', value: moqtObj.payload.length });
  }

  if (type === 'moq-audio') {
    const moqtObj = payload;
    const extensionHeaders = extentions;
    if (!audioDecoder) {
      audioDecoder = new AudioDecoder({
        output: (frame) => {
          const pcm = new Float32Array(frame.numberOfFrames * frame.numberOfChannels);
          frame.copyTo(pcm, { planeIndex: 0 });
          self.postMessage({
            type: 'audio',
            samples: Array.from(pcm),
            sampleRate: frame.sampleRate,
          });
          frame.close();
        },
        error: console.error,
      });
      audioDecoder.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1 });
    }
    const chunk = new EncodedAudioChunk({
      timestamp: 0/* extract from headers or set to 0 */,
      type: 'key', // or 'delta' if you can distinguish
      data: new Uint8Array(moqtObj.payload),
    });
    audioDecoder.decode(chunk);

    // Send throughput data for audio (payload size)
    self.postMessage({ type: 'throughput', value: moqtObj.payload.length });
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
      let dw = targetWidth, dh = targetHeight, dx = 0, dy = 0
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
}
