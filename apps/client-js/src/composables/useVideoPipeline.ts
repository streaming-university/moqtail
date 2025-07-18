import { ExtensionHeaders } from '../../../../libs/moqtail-ts/src/model/extension_header/extension_header'
import { ObjectForwardingPreference } from '../../../../libs/moqtail-ts/src/model/data/constant'
import { MoqtailClient } from '../../../../libs/moqtail-ts/src/client/client'
import { FilterType, GroupOrder, SubscribeError } from '../../../../libs/moqtail-ts/src/model/control'
import { Tuple } from '../../../../libs/moqtail-ts/src/model/common/tuple'
import { LiveTrackSource } from '../../../../libs/moqtail-ts/src/client/track/content_source'
import { FullTrackName, MoqtObject } from '../../../../libs/moqtail-ts/src/model/data'
import { Location } from '../../../../libs/moqtail-ts/src/model/common/location'
import { PlayoutBuffer } from '../../../../libs/moqtail-ts/src/util/playout_buffer'
import { NetworkTelemetry } from '../../../../libs/moqtail-ts/src/util/telemetry'
import { RefObject } from 'react'
import { SubscribeOptions } from '../../../../libs/moqtail-ts/src/client/types'
import { SocketClock } from '../util/socketClock'

let clock: SocketClock
export function setClock(c: SocketClock) {
  clock = c
}
setInterval(() => {
  const localTime = Date.now()
  const serverTime = clock.now()
  const diff = localTime - serverTime
  console.log(`Local Time:${localTime} | Estimated Server Time:${serverTime}\nDifference:${diff}`)
}, 2000)
export async function connectToRelay(url: string) {
  return await MoqtailClient.new({ url, supportedVersions: [0xff00000b] })
}

export async function announceNamespaces(moqClient: MoqtailClient, namespace: Tuple) {
  await moqClient.announce(namespace)
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
  const audioContentSource = new LiveTrackSource(audioStream)
  moqClient.addOrUpdateTrack({
    fullTrackName: audioFullTrackName,
    forwardingPreference: ObjectForwardingPreference.Subgroup,
    trackSource: { live: audioContentSource },
    publisherPriority: 128, // Magic number
    trackAlias: audioTrackAlias,
  })
  const videoContentSource = new LiveTrackSource(videoStream)
  moqClient.addOrUpdateTrack({
    fullTrackName: videoFullTrackName,
    forwardingPreference: ObjectForwardingPreference.Subgroup,
    trackSource: { live: videoContentSource },
    publisherPriority: 128, // Magic number
    trackAlias: videoTrackAlias,
  })
  const chatContentSource = new LiveTrackSource(chatStream)
  moqClient.addOrUpdateTrack({
    fullTrackName: chatFullTrackName,
    forwardingPreference: ObjectForwardingPreference.Subgroup,
    trackSource: { live: chatContentSource },
    publisherPriority: 128, // Magic number
    trackAlias: chatTrackAlias,
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
  initialChatGroupId = 10001,
  initialChatObjectId = 0,
}: {
  chatFullTrackName: any
  chatStreamController: ReadableStreamDefaultController<any> | null
  publisherPriority?: number
  objectForwardingPreference: any
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
      BigInt(Math.round(clock.now())),
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
  objectForwardingPreference,
}: {
  stream: MediaStream
  audioFullTrackName: FullTrackName
  audioStreamController: ReadableStreamDefaultController<MoqtObject> | null
  publisherPriority: number
  audioGroupId: number
  objectForwardingPreference: ObjectForwardingPreference
}) {
  console.log('Starting audio encoder with group ID:', audioGroupId)
  let audioObjectId = 0n
  let currentAudioGroupId = audioGroupId
  let shouldEncode = true

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
        if (!shouldEncode) return

        const payload = new Uint8Array(chunk.byteLength)
        chunk.copyTo(payload)

        const captureTime = Math.round(clock!.now())
        const locHeaders = new ExtensionHeaders().addCaptureTimestamp(captureTime)

        // console.log('AudioEncoder output chunk:', chunk);
        const moqt = MoqtObject.newWithPayload(
          audioFullTrackName,
          new Location(BigInt(currentAudioGroupId), BigInt(audioObjectId++)),
          publisherPriority,
          objectForwardingPreference,
          BigInt(Math.round(clock!.now())),
          locHeaders.build(),
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
    if (!shouldEncode) return

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

  return {
    audioNode,
    audioEncoder,
    setEncoding: (enabled: boolean) => {
      shouldEncode = enabled
      if (!enabled) {
        pcmBuffer = []
      }
    },
  }
}

export function initializeVideoEncoder({
  videoFullTrackName,
  videoStreamController,
  publisherPriority,
  objectForwardingPreference,
}: {
  videoFullTrackName: FullTrackName
  videoStreamController: ReadableStreamDefaultController<MoqtObject> | null
  publisherPriority: number
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
          captureTime = Math.round(clock!.now())
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

      videoReader = new (window as any).MediaStreamTrackProcessor({
        track: videoTrack,
      }).readable.getReader()

      const readAndEncode = async (reader: ReadableStreamDefaultReader<any>) => {
        while (encoderActive) {
          try {
            const result = await reader.read()
            if (result.done) break

            const captureTime = Math.round(clock!.now())
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
  objectForwardingPreference,
}: {
  stream: MediaStream
  videoFullTrackName: FullTrackName
  videoStreamController: ReadableStreamDefaultController<MoqtObject> | null
  publisherPriority: number
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
          captureTime = Math.round(clock!.now())
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
    videoEncoder.configure(window.appSettings.videoEncoderConfig)
  }

  createVideoEncoder()

  const videoTrack = stream.getVideoTracks()[0]
  if (!videoTrack) {
    console.error('No video track available in stream')
    return { stop: async () => {} }
  }

  videoReader = new (window as any).MediaStreamTrackProcessor({
    track: videoTrack,
  }).readable.getReader()

  const readAndEncode = async (reader: ReadableStreamDefaultReader<any>) => {
    while (encoderActive) {
      try {
        const result = await reader.read()
        if (result.done) break

        const captureTime = Math.round(clock!.now())
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

function initWorkerAndCanvas(canvas: HTMLCanvasElement) {
  const worker = new Worker(new URL('@app/workers/decoderWorker.ts', import.meta.url), { type: 'module' })
  const offscreen = canvas.transferControlToOffscreen()
  worker.postMessage({ type: 'init', canvas: offscreen, decoderConfig: window.appSettings.videoDecoderConfig }, [
    offscreen,
  ])
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
  subscribeArgs: SubscribeOptions,
  worker: Worker,
  type: 'moq' | 'moq-audio',
) {
  moqClient.subscribe(subscribeArgs).then((response) => {
    window.appSettings.playoutBufferConfig.maxLatencyMs
    if (!(response instanceof SubscribeError)) {
      const { requestId, stream } = response
      const buffer = new PlayoutBuffer(stream, {
        targetLatencyMs: window.appSettings.playoutBufferConfig.targetLatencyMs,
        maxLatencyMs: window.appSettings.playoutBufferConfig.maxLatencyMs,
        clock,
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
        worker.postMessage(
          {
            type,
            extentions: obj.extensionHeaders,
            payload: obj,
            serverTimestamp: clock!.now(),
            frameTimeoutMs: window.appSettings.frameTimeoutMs,
          },
          [obj.payload.buffer],
        )
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
      console.error('Subscribe Error:', response)
    }
  })
}

function handleWorkerMessages(
  worker: Worker,
  audioNode: AudioWorkletNode,
  videoTelemetry?: NetworkTelemetry,
  audioTelemetry?: NetworkTelemetry,
) {
  worker.onmessage = (event) => {
    if (event.data.type === 'audio') {
      // console.log('Received audio data from worker:', event.data);
      audioNode.port.postMessage(new Float32Array(event.data.samples))
    }
    if (event.data.type === 'video-telemetry') {
      if (videoTelemetry) {
        videoTelemetry.push({
          latency: Math.abs(event.data.latency),
          size: event.data.throughput,
        })
      }
    }
    if (event.data.type === 'audio-telemetry') {
      if (audioTelemetry) {
        audioTelemetry.push({
          latency: Math.abs(event.data.latency),
          size: event.data.throughput,
        })
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
    // TODO: Add chat track
    let tracks = setupTracks(moqClient, audioFullTrackName, videoFullTrackName)

    const videoPromise = startVideoEncoder({
      stream,
      videoFullTrackName,
      videoStreamController: tracks.getVideoStreamController(),
      publisherPriority: 1,
      objectForwardingPreference: ObjectForwardingPreference.Subgroup,
    })

    const audioPromise = startAudioEncoder({
      stream,
      audioFullTrackName,
      audioStreamController: tracks.getAudioStreamController(),
      publisherPriority: 1,
      audioGroupId: 0,
      objectForwardingPreference: ObjectForwardingPreference.Subgroup,
    })

    await Promise.all([videoPromise, audioPromise])

    return () => {}
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
  videoTelemetry?: NetworkTelemetry,
  audioTelemetry?: NetworkTelemetry,
) {
  const setup = async () => {
    const canvas = canvasRef.current
    console.log('Now will check for canvas ref')
    if (!canvas) return
    console.log('Worker and audio node is going to be initialized')
    const worker = initWorkerAndCanvas(canvas)
    const audioNode = await setupAudioPlayback(new AudioContext({ sampleRate: 48000 }))
    console.log('Worker and audio node initialized')

    handleWorkerMessages(worker, audioNode, videoTelemetry, audioTelemetry)

    console.log('Going to subscribe to audio')

    subscribeAndPipeToWorker(
      moqClient,
      {
        fullTrackName: audioFullTrackName,
        groupOrder: GroupOrder.Original,
        filterType: FilterType.LatestObject,
        forward: true,
        priority: 0,
        trackAlias: audioTrackAlias,
      },
      worker,
      'moq-audio',
    )
    console.log('Subscribed to audio', audioFullTrackName)

    console.log('Subscribed to video', videoFullTrackName)
    subscribeAndPipeToWorker(
      moqClient,
      {
        fullTrackName: videoFullTrackName,
        groupOrder: GroupOrder.Original,
        filterType: FilterType.LatestObject,
        forward: true,
        priority: 0,
        trackAlias: videoTrackAlias,
      },
      worker,
      'moq',
    )

    return () => {
      worker.terminate()
    }
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
  moqClient
    .subscribe({
      fullTrackName: chatFullTrackName,
      groupOrder: GroupOrder.Original,
      filterType: FilterType.LatestObject,
      forward: true,
      priority: 0,
      trackAlias: chatTrackAlias,
    })
    .then((response) => {
      if (!(response instanceof SubscribeError)) {
        const { requestId, stream } = response
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
        console.error('Subscribe Error:', response)
      }
    })
}
