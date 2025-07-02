import { ExtensionHeaders } from '../../../../libs/moqtail-ts/src/model/extension_header/extension_header'
import { ObjectForwardingPreference } from '../../../../libs/moqtail-ts/src/model/data/constant'
import { MoqtailClient } from '../../../../libs/moqtail-ts/src/client/client'
import { Announce, ClientSetup, GroupOrder, Subscribe } from '../../../../libs/moqtail-ts/src/model/control'
import { SetupParameters } from '../../../../libs/moqtail-ts/src/model/parameter/setup_parameter'
import { Tuple } from '../../../../libs/moqtail-ts/src/model/common/tuple'
import { LiveContentSource } from '../../../../libs/moqtail-ts/src/client/track/content_source'
import { FullTrackName, MoqtObject } from '../../../../libs/moqtail-ts/src/model/data'
import { Location } from '../../../../libs/moqtail-ts/src/model/common/location'
import { AkamaiOffset } from '../../../../libs/moqtail-ts/src/util/get_akamai_offset'
import { PlayoutBuffer } from '../../../../libs/moqtail-ts/src/util/playout_buffer'
import { NetworkTelemetry } from '../../../../libs/moqtail-ts/src/util/telemetry'
import { RefObject } from 'react'
import { ClockNormalizer } from '../../../../libs/moqtail-ts/src/util/clock_normalizer'

let clockNormal: ClockNormalizer
async function setupClockNormalizer() {
  clockNormal = await ClockNormalizer.create(
    window.appSettings.clockNormalizationConfig.timeServerUrl,
    window.appSettings.clockNormalizationConfig.numberOfSamples,
  )
}
setupClockNormalizer()

async function initTransport(url: string) {
  const transport = new WebTransport(url)
  await transport.ready
  return transport
}

export async function sendClientSetup(relayConnectionUrl: string) {
  const webTransport = await initTransport(relayConnectionUrl)
  const setupParams = new SetupParameters()
  const clientSetup = new ClientSetup([0xff00000b], setupParams.build())
  const moqClient = await MoqtailClient.new(clientSetup, webTransport)
  return moqClient
}

export async function announceNamespaces(moqClient: MoqtailClient, namespace: Tuple) {
  const announceMessage = new Announce(moqClient.nextClientRequestId, namespace, [])
  await moqClient.announce(announceMessage)
}

export function setupTracks(
  moqClient: MoqtailClient,
  audioFullTrackName: FullTrackName,
  videoFullTrackName: FullTrackName,
  chatFullTrackName: FullTrackName,
  audioTrackAlias: bigint,
  videoTrackAlias: bigint,
  chatTrackAlias: bigint,
) {
  let audioStreamController: ReadableStreamDefaultController<MoqtObject> | null = null
  const audioStream = new ReadableStream<MoqtObject>({
    start(controller) {
      audioStreamController = controller
    },
    cancel() {
      audioStreamController = null
    },
  })
  let videoStreamController: ReadableStreamDefaultController<MoqtObject> | null = null
  const videoStream = new ReadableStream<MoqtObject>({
    start(controller) {
      videoStreamController = controller
    },
    cancel() {
      videoStreamController = null
    },
  })
  let chatStreamController: ReadableStreamDefaultController<MoqtObject> | null = null
  const chatStream = new ReadableStream<MoqtObject>({
    start(controller) {
      chatStreamController = controller
    },
    cancel() {
      chatStreamController = null
    },
  })
  const audioContentSource = new LiveContentSource(audioStream)
  moqClient.addOrUpdateTrack({
    fullTrackName: audioFullTrackName,
    trackAlias: audioTrackAlias,
    forwardingPreference: ObjectForwardingPreference.Subgroup,
    contentSource: audioContentSource,
  })
  const videoContentSource = new LiveContentSource(videoStream)
  moqClient.addOrUpdateTrack({
    fullTrackName: videoFullTrackName,
    trackAlias: videoTrackAlias,
    forwardingPreference: ObjectForwardingPreference.Subgroup,
    contentSource: videoContentSource,
  })
  const chatContentSource = new LiveContentSource(chatStream)
  moqClient.addOrUpdateTrack({
    fullTrackName: chatFullTrackName,
    trackAlias: chatTrackAlias,
    forwardingPreference: ObjectForwardingPreference.Subgroup,
    contentSource: chatContentSource,
  })
  return {
    audioStream,
    videoStream,
    chatStream,
    getAudioStreamController: () => audioStreamController,
    getVideoStreamController: () => videoStreamController,
    getChatStreamController: () => chatStreamController,
  }
}

export function initializeChatMessageSender({
  chatFullTrackName,
  chatStreamController,
  publisherPriority = 1,
  objectForwardingPreference,
  offset = 0,
  initialChatGroupId = 10001,
  initialChatObjectId = 0,
}: {
  chatFullTrackName: any
  chatStreamController: ReadableStreamDefaultController<any> | null
  publisherPriority?: number
  objectForwardingPreference: any
  offset?: number
  initialChatGroupId?: number
  initialChatObjectId?: number
}) {
  function send(message: string) {
    if (!chatStreamController) return
    const payload = new TextEncoder().encode(message)
    const moqt = MoqtObject.newWithPayload(
      chatFullTrackName,
      new Location(BigInt(initialChatGroupId++), BigInt(initialChatObjectId)),
      publisherPriority,
      objectForwardingPreference,
      BigInt(Math.round(performance.timeOrigin + performance.now() + offset)),
      null,
      payload,
    )
    chatStreamController.enqueue(moqt)
    console.log('Chat message sent with location:', initialChatGroupId, initialChatObjectId)
  }

  return { send }
}

export async function startAudioEncoder({
  stream,
  audioFullTrackName,
  audioStreamController,
  publisherPriority,
  audioGroupId,
  offset,
  objectForwardingPreference,
}: {
  stream: MediaStream
  audioFullTrackName: FullTrackName
  audioStreamController: ReadableStreamDefaultController<MoqtObject> | null
  publisherPriority: number
  audioGroupId: number
  offset: number
  objectForwardingPreference: ObjectForwardingPreference
}) {
  console.log('Starting audio encoder with group ID:', audioGroupId)
  let audioObjectId = 0n
  let currentAudioGroupId = audioGroupId
  setInterval(() => {
    currentAudioGroupId += 2
  }, 2000)

  const audioContext = new AudioContext({ sampleRate: 48000 })
  await audioContext.audioWorklet.addModule(new URL('@app/workers/pcmPlayerProcessor.js', import.meta.url))

  const source = audioContext.createMediaStreamSource(stream) // same stream as video
  const audioNode = new AudioWorkletNode(audioContext, 'audio-encoder-processor')
  source.connect(audioNode)
  audioNode.connect(audioContext.destination)

  console.log('adding audio encoder')
  let audioEncoder: AudioEncoder | null = null
  if (typeof AudioEncoder !== 'undefined') {
    audioEncoder = new AudioEncoder({
      output: (chunk) => {
        const payload = new Uint8Array(chunk.byteLength)
        chunk.copyTo(payload)
        // console.log('AudioEncoder output chunk:', chunk);
        const moqt = MoqtObject.newWithPayload(
          audioFullTrackName,
          new Location(BigInt(currentAudioGroupId), BigInt(audioObjectId++)),
          publisherPriority,
          objectForwardingPreference,
          BigInt(Math.round(performance.timeOrigin + performance.now() + offset)),
          null,
          payload,
        )
        // console.log('AudioEncoder output:', moqt);
        audioStreamController?.enqueue(moqt)
      },
      error: console.error,
    })
    audioEncoder.configure(window.appSettings.audioEncoderConfig)
  }

  let pcmBuffer: Float32Array[] = []
  const AUDIO_PACKET_SAMPLES = 960

  audioNode.port.onmessage = (event) => {
    // console.log('Received audio data from AudioWorkletNode:', event.data);
    if (!audioEncoder) return
    // console.log('Audio data received, processing...');
    const samples = event.data as Float32Array
    pcmBuffer.push(samples)

    let totalSamples = pcmBuffer.reduce((sum, arr) => sum + arr.length, 0)
    while (totalSamples >= AUDIO_PACKET_SAMPLES) {
      let out = new Float32Array(AUDIO_PACKET_SAMPLES)
      let offset = 0
      while (offset < AUDIO_PACKET_SAMPLES && pcmBuffer.length > 0) {
        let needed = AUDIO_PACKET_SAMPLES - offset
        let chunk = pcmBuffer[0]
        if (chunk.length <= needed) {
          out.set(chunk, offset)
          offset += chunk.length
          pcmBuffer.shift()
        } else {
          out.set(chunk.subarray(0, needed), offset)
          pcmBuffer[0] = chunk.subarray(needed)
          offset += needed
        }
      }
      const audioData = new AudioData({
        format: 'f32',
        sampleRate: 48000,
        numberOfFrames: AUDIO_PACKET_SAMPLES,
        numberOfChannels: 1,
        timestamp: performance.now() * 1000,
        data: out.buffer,
      })
      audioEncoder.encode(audioData)
      audioData.close()
      totalSamples -= AUDIO_PACKET_SAMPLES
    }
  }

  return { audioNode, audioEncoder }
}

export function initializeVideoEncoder({
  videoFullTrackName,
  videoStreamController,
  publisherPriority,
  offset,
  objectForwardingPreference,
}: {
  videoFullTrackName: FullTrackName
  videoStreamController: ReadableStreamDefaultController<MoqtObject> | null
  publisherPriority: number
  offset: number
  objectForwardingPreference: ObjectForwardingPreference
}) {
  let videoEncoder: VideoEncoder | null = null
  let encoderActive = true
  let videoGroupId = 0
  let videoObjectId = 0n
  let isFirstKeyframeSent = false
  let videoConfig: ArrayBuffer | null = null
  let frameCounter = 0
  const pendingVideoTimestamps: number[] = []
  let videoReader: ReadableStreamDefaultReader<any> | null = null

  const createVideoEncoder = () => {
    isFirstKeyframeSent = false
    //videoGroupId = 0 //if problematic, open this
    videoObjectId = 0n
    frameCounter = 0
    pendingVideoTimestamps.length = 0
    //videoConfig = null

    videoEncoder = new VideoEncoder({
      output: async (chunk, meta) => {
        if (chunk.type === 'key') {
          videoGroupId++
          videoObjectId = 0n
        }

        let captureTime = pendingVideoTimestamps.shift()
        if (captureTime === undefined) {
          console.warn('No capture time available for video frame, skipping')
          captureTime = Math.round(performance.timeOrigin + performance.now() + offset)
        }

        const locHeaders = new ExtensionHeaders()
          .addCaptureTimestamp(captureTime)
          .addVideoFrameMarking(chunk.type === 'key' ? 1 : 0)

        const desc = meta?.decoderConfig?.description
        if (!isFirstKeyframeSent && desc instanceof ArrayBuffer) {
          videoConfig = desc
          locHeaders.addVideoConfig(new Uint8Array(desc))
          isFirstKeyframeSent = true
        }
        if (isFirstKeyframeSent && videoConfig instanceof ArrayBuffer) {
          locHeaders.addVideoConfig(new Uint8Array(videoConfig))
        }
        const frameData = new Uint8Array(chunk.byteLength)
        chunk.copyTo(frameData)

        const moqt = MoqtObject.newWithPayload(
          videoFullTrackName,
          new Location(BigInt(videoGroupId), BigInt(videoObjectId++)),
          publisherPriority,
          objectForwardingPreference,
          0n,
          locHeaders.build(),
          frameData,
        )
        if (videoStreamController) {
          videoStreamController.enqueue(moqt)
        } else {
          console.error('videoStreamController is not available')
        }
      },
      error: console.error,
    })
    console.log('Configuring video encoder with settings:', window.appSettings.videoEncoderConfig)
    videoEncoder.configure(window.appSettings.videoEncoderConfig)
  }

  createVideoEncoder()

  const stop = async () => {
    encoderActive = false
    if (videoReader) {
      try {
        await videoReader.cancel()
      } catch (e) {
        // ignore cancel errors
      }
      videoReader = null
    }
    if (videoEncoder) {
      try {
        await videoEncoder.flush()
        videoEncoder.close()
      } catch (e) {
        // ignore close errors
      }
      videoEncoder = null
    }
  }

  return {
    videoEncoder,
    encoderActive,
    pendingVideoTimestamps,
    frameCounter,
    offset,
    start: async (stream: MediaStream) => {
      // Stop previous encoder and reset state
      if (videoEncoder && encoderActive) {
        encoderActive = false
        await stop()
      }

      if (!stream) {
        return { videoEncoder: null, videoReader: null }
      }

      encoderActive = true
      createVideoEncoder()

      const videoTrack = stream.getVideoTracks()[0]
      if (!videoTrack) {
        return { videoEncoder: null, videoReader: null }
      }

      const isFake = (videoTrack as any).isFake === true

      videoReader = new (window as any).MediaStreamTrackProcessor({
        track: videoTrack,
      }).readable.getReader()

      const readAndEncode = async (reader: ReadableStreamDefaultReader<any>) => {
        while (encoderActive) {
          try {
            const result = await reader.read()
            if (result.done) break

            // Use 0 timestamp for fake tracks, normal timing for real tracks
            const captureTime = Math.round(performance.timeOrigin + performance.now() + offset)
            pendingVideoTimestamps.push(captureTime)

            try {
              let insert_keyframe = false
              if (window.appSettings.keyFrameInterval !== 'auto') {
                insert_keyframe = frameCounter % (window.appSettings.keyFrameInterval || 0) === 0
              }

              if (insert_keyframe) {
                videoEncoder?.encode(result.value, { keyFrame: insert_keyframe })
              } else {
                videoEncoder?.encode(result.value)
              }
              frameCounter++
            } catch (encodeError) {
              console.error('Error encoding video frame:', encodeError)
            } finally {
              if (result.value && typeof result.value.close === 'function') {
                result.value.close()
              }
            }
          } catch (readError) {
            console.error('Error reading video frame:', readError)
            if (!encoderActive) break
          }
        }
      }

      if (!videoReader) {
        console.error('Failed to create video reader')
        return
      }
      readAndEncode(videoReader)
      return { videoEncoder, videoReader }
    },
    stop,
  }
}

export async function startVideoEncoder({
  stream,
  videoFullTrackName,
  videoStreamController,
  publisherPriority,
  offset,
  objectForwardingPreference,
}: {
  stream: MediaStream
  videoFullTrackName: FullTrackName
  videoStreamController: ReadableStreamDefaultController<MoqtObject> | null
  publisherPriority: number
  offset: number
  objectForwardingPreference: ObjectForwardingPreference
}) {
  if (!stream) {
    console.error('No stream provided to video encoder')
    return { stop: async () => {} }
  }

  let videoEncoder: VideoEncoder | null = null
  let videoReader: ReadableStreamDefaultReader<any> | null = null
  let encoderActive = true
  let videoGroupId = 0
  let videoObjectId = 0n
  let isFirstKeyframeSent = false
  let videoConfig: ArrayBuffer | null = null
  let frameCounter = 0
  const pendingVideoTimestamps: number[] = []

  const createVideoEncoder = () => {
    isFirstKeyframeSent = false
    videoGroupId = 0
    videoObjectId = 0n
    frameCounter = 0
    pendingVideoTimestamps.length = 0
    videoConfig = null

    videoEncoder = new VideoEncoder({
      output: async (chunk, meta) => {
        if (chunk.type === 'key') {
          videoGroupId++
          videoObjectId = 0n
        }

        let captureTime = pendingVideoTimestamps.shift()
        if (captureTime === undefined) {
          console.warn('No capture time available for video frame, skipping')
          captureTime = Math.round(performance.timeOrigin + performance.now() + offset)
        }

        const locHeaders = new ExtensionHeaders()
          .addCaptureTimestamp(clockNormal.now())
          .addVideoFrameMarking(chunk.type === 'key' ? 1 : 0)

        const desc = meta?.decoderConfig?.description
        if (!isFirstKeyframeSent && desc instanceof ArrayBuffer) {
          videoConfig = desc
          locHeaders.addVideoConfig(new Uint8Array(desc))
          isFirstKeyframeSent = true
        }
        if (isFirstKeyframeSent && videoConfig instanceof ArrayBuffer) {
          locHeaders.addVideoConfig(new Uint8Array(videoConfig))
        }
        const frameData = new Uint8Array(chunk.byteLength)
        chunk.copyTo(frameData)

        const moqt = MoqtObject.newWithPayload(
          videoFullTrackName,
          new Location(BigInt(videoGroupId), BigInt(videoObjectId++)),
          publisherPriority,
          objectForwardingPreference,
          0n,
          locHeaders.build(),
          frameData,
        )
        if (videoStreamController) {
          videoStreamController.enqueue(moqt)
        } else {
          console.error('videoStreamController is not available')
        }
      },
      error: console.error,
    })
    videoEncoder.configure(window.appSettings.videoEncoderConfig)
  }

  createVideoEncoder()

  const videoTrack = stream.getVideoTracks()[0]
  if (!videoTrack) {
    console.error('No video track available in stream')
    return { stop: async () => {} }
  }

  const isFake = (videoTrack as any).isFake === true

  videoReader = new (window as any).MediaStreamTrackProcessor({
    track: videoTrack,
  }).readable.getReader()

  const readAndEncode = async (reader: ReadableStreamDefaultReader<any>) => {
    while (encoderActive) {
      try {
        const result = await reader.read()
        if (result.done) break

        const captureTime = Math.round(performance.timeOrigin + performance.now() + offset)
        pendingVideoTimestamps.push(captureTime)

        // Our video is 25 fps. Each 2s, we can send a new keyframe.
        const insert_keyframe = frameCounter % 50 === 0

        try {
          videoEncoder?.encode(result.value, { keyFrame: insert_keyframe })
          frameCounter++
        } catch (encodeError) {
          console.error('Error encoding video frame:', encodeError)
        } finally {
          if (result.value && typeof result.value.close === 'function') {
            result.value.close()
          }
        }
      } catch (readError) {
        console.error('Error reading video frame:', readError)
        if (!encoderActive) break
      }
    }
  }

  if (!videoReader) {
    console.error('Failed to create video reader')
    return { stop: async () => {} }
  }
  readAndEncode(videoReader)

  const stop = async () => {
    encoderActive = false
    if (videoReader) {
      try {
        await videoReader.cancel()
      } catch (e) {
        // ignore cancel errors
      }
      videoReader = null
    }
    if (videoEncoder) {
      try {
        await videoEncoder.flush()
        videoEncoder.close()
      } catch (e) {
        // ignore close errors
      }
      videoEncoder = null
    }
  }

  return { videoEncoder, videoReader, stop }
}

function initWorkerAndCanvas(canvas: HTMLCanvasElement, offset: number) {
  const worker = new Worker(new URL('@app/workers/decoderWorker.ts', import.meta.url), { type: 'module' })
  const offscreen = canvas.transferControlToOffscreen()
  worker.postMessage(
    { type: 'init', canvas: offscreen, offset, decoderConfig: window.appSettings.videoDecoderConfig },
    [offscreen],
  )
  return worker
}

async function setupAudioPlayback(audioContext: AudioContext) {
  await audioContext.audioWorklet.addModule(new URL('@app/workers/pcmPlayerProcessor.js', import.meta.url))
  const audioNode = new AudioWorkletNode(audioContext, 'pcm-player-processor')
  audioNode.connect(audioContext.destination)
  return audioNode
}

function subscribeAndPipeToWorker(
  moqClient: MoqtailClient,
  subscribeMsg: Subscribe,
  worker: Worker,
  type: 'moq' | 'moq-audio',
) {
  moqClient.subscribe(subscribeMsg).then((stream) => {
    window.appSettings.playoutBufferConfig.maxLatencyMs
    if (stream instanceof ReadableStream) {
      const buffer = new PlayoutBuffer(stream, {
        targetLatencyMs: window.appSettings.playoutBufferConfig.targetLatencyMs,
        maxLatencyMs: window.appSettings.playoutBufferConfig.maxLatencyMs,
        clockNormalizer: clockNormal,
      })
      buffer.onObject = (obj) => {
        if (!obj) {
          // Stream ended or error
          console.warn(`Buffer terminated ${type}`)
          return
        }

        if (!obj.payload) {
          console.warn('Received MoqtObject without payload, skipping:', obj)
          // Request next object immediately
          return
        }
        // Send to worker
        worker.postMessage({ type, extentions: obj.extensionHeaders, payload: obj }, [obj.payload.buffer])
      }

      /* If you want to use without any buffering, you may use the following...
      const reader = stream.getReader();
      (async () => {
        while (true) {
          const { done, value: obj } = await reader.read();
          if (!(obj instanceof MoqtObject)) throw new Error('Expected MoqtObject, got: ' + obj);
          if (done) break;
          if (!obj.payload) {
            console.warn('Received MoqtObject without payload, skipping:', obj);
            continue;
          }
          worker.postMessage({ type, extentions: obj.extensionHeaders, payload: obj }, [obj.payload.buffer]);
        }
      })()
      */
    } else {
      console.error('Subscribe failed:', stream)
    }
  })
}

function handleWorkerMessages(worker: Worker, audioNode: AudioWorkletNode, telemetry?: NetworkTelemetry) {
  worker.onmessage = (event) => {
    if (event.data.type === 'audio') {
      // console.log('Received audio data from worker:', event.data);
      audioNode.port.postMessage(new Float32Array(event.data.samples))
    }
    if (event.data.type === 'latency') {
      if (telemetry) {
        telemetry.push({ latency: Math.abs(event.data.value), size: 0 }) // Size will be added from decoder
      }
    }
    if (event.data.type === 'throughput') {
      if (telemetry) {
        telemetry.push({ latency: 0, size: event.data.value })
      }
    }
  }
}

export function useVideoPublisher(
  moqClient: MoqtailClient,
  videoRef: RefObject<HTMLVideoElement>,
  mediaStream: RefObject<MediaStream | null>,
  roomId: string,
  userId: string,
  videoTrackAlias: number,
  audioTrackAlias: number,
  videoFullTrackName: FullTrackName,
  audioFullTrackName: FullTrackName,
) {
  const setup = async () => {
    const offset = await AkamaiOffset.getClockSkew()
    const video = videoRef.current
    if (!video) {
      console.error('Video element is not available')
      return
    }

    const stream = mediaStream.current
    if (stream instanceof MediaStream) {
      video.srcObject = stream
    } else {
      console.error('Expected MediaStream, got:', stream)
    }
    if (!stream) {
      console.error('MediaStream is not available')
      return
    }
    video.muted = true
    announceNamespaces(moqClient, videoFullTrackName.namespace)
    let tracks = setupTracks(
      moqClient,
      audioFullTrackName,
      videoFullTrackName,
      BigInt(audioTrackAlias),
      BigInt(videoTrackAlias),
    )

    const videoPromise = startVideoEncoder({
      stream,
      videoFullTrackName,
      videoStreamController: tracks.getVideoStreamController(),
      publisherPriority: 1,
      offset,
      objectForwardingPreference: ObjectForwardingPreference.Subgroup,
    })

    const audioPromise = startAudioEncoder({
      stream,
      audioFullTrackName,
      audioStreamController: tracks.getAudioStreamController(),
      publisherPriority: 1,
      audioGroupId: 0,
      offset,
      objectForwardingPreference: ObjectForwardingPreference.Subgroup,
    })

    const [videoEncoderResult, audioEncoderResult] = await Promise.all([videoPromise, audioPromise])
  }
  return setup
}

export function useVideoSubscriber(
  moqClient: MoqtailClient,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  videoTrackAlias: number,
  audioTrackAlias: number,
  videoFullTrackName: FullTrackName,
  audioFullTrackName: FullTrackName,
  telemetry?: NetworkTelemetry,
) {
  const setup = async () => {
    const offset = await AkamaiOffset.getClockSkew()
    const canvas = canvasRef.current
    console.log('Now will check for canvas ref')
    if (!canvas) return
    console.log('Worker and audio node is going to be initialized')
    const worker = initWorkerAndCanvas(canvas, offset)
    const audioNode = await setupAudioPlayback(new AudioContext({ sampleRate: 48000 }))
    console.log('Worker and audio node initialized')

    handleWorkerMessages(worker, audioNode, telemetry)

    console.log('Going to subscribe to audio')
    const subscribeAudio = Subscribe.newLatestObject(
      moqClient.nextClientRequestId,
      BigInt(audioTrackAlias),
      audioFullTrackName,
      0,
      GroupOrder.Original,
      true,
      [],
    )
    subscribeAndPipeToWorker(moqClient, subscribeAudio, worker, 'moq-audio')
    console.log('Subscribed to audio', audioFullTrackName)

    const subscribeVideo = Subscribe.newLatestObject(
      moqClient.nextClientRequestId,
      BigInt(videoTrackAlias),
      videoFullTrackName,
      0,
      GroupOrder.Original,
      true,
      [],
    )
    console.log('Subscribed to video', videoFullTrackName)
    subscribeAndPipeToWorker(moqClient, subscribeVideo, worker, 'moq')
    return true
  }
  return setup
}

export async function subscribeToChatTrack({
  moqClient,
  chatTrackAlias,
  chatFullTrackName,
  onMessage,
}: {
  moqClient: MoqtailClient
  chatTrackAlias: number
  chatFullTrackName: FullTrackName
  onMessage: (msg: any) => void
}) {
  const subscribeMsg = Subscribe.newLatestObject(
    moqClient.nextClientRequestId,
    BigInt(chatTrackAlias),
    chatFullTrackName,
    0,
    GroupOrder.Original,
    true,
    [],
  )

  moqClient.subscribe(subscribeMsg).then((stream) => {
    if (stream instanceof ReadableStream) {
      const reader = stream.getReader()
      ;(async () => {
        while (true) {
          const { done, value: obj } = await reader.read()
          console.log('Received chat object:', obj?.location?.group?.toString(), obj?.location?.object?.toString())
          if (!(obj instanceof MoqtObject)) throw new Error('Expected MoqtObject, got: ' + obj)
          if (done) break
          if (!obj.payload) {
            console.warn('Received MoqtObject without payload, skipping:', obj)
            continue
          }
          try {
            const decoded = new TextDecoder().decode(obj.payload)
            const msgObj = JSON.parse(decoded)
            console.log('Decoded chat message:', msgObj)
            onMessage(msgObj)
          } catch (e) {
            console.error('Failed to decode chat message', e)
          }
        }
      })()
    } else {
      console.error('Subscribe failed:', stream)
    }
  })
}
