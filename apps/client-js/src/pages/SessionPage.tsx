import React, { useState, useEffect, useRef } from 'react'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Phone,
  Send,
  Users,
  MessageSquare,
  Info,
  X,
  Smile,
  Activity,
  Expand,
  Minimize,
} from 'lucide-react'

import { useSession } from '../contexts/SessionContext'
import {
  RoomUser,
  ChatMessage,
  TrackUpdateResponse,
  ToggleResponse,
  UserDisconnectedMessage,
  UpdateTrackRequest,
  RoomTimeoutMessage,
} from '../types/types'
import { useSocket } from '../sockets/SocketContext'
import { FullTrackName, ObjectForwardingPreference, Tuple } from '../../../../libs/moqtail-ts/src/model'
import {
  announceNamespaces,
  initializeChatMessageSender,
  initializeVideoEncoder,
  connectToRelay,
  setupTracks,
  startAudioEncoder,
  subscribeToChatTrack,
  useVideoSubscriber,
  cleanupClockNormalizer,
} from '../composables/useVideoPipeline'
import { MoqtailClient } from '../../../../libs/moqtail-ts/src/client/client'
import { NetworkTelemetry } from '../../../../libs/moqtail-ts/src/util/telemetry'
import { ClockNormalizer } from '../../../../libs/moqtail-ts/src/util/clock_normalizer'

function SessionPage() {
  // initialize the MOQTail client
  const relayUrl = window.appSettings.relayUrl
  const [moqClient, setMoqClient] = useState<MoqtailClient | undefined>(undefined)

  // initialize the variables
  const [maximizedUserId, setMaximizedUserId] = useState<string | null>(null)
  const { userId, username, roomState, setSession, clearSession } = useSession()
  const [isMicOn, setIsMicOn] = useState(false)
  const [isCamOn, setisCamOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(true) // TODO: implement MoQ chat
  const [chatMessage, setChatMessage] = useState('')
  const { socket: contextSocket, reconnect } = useSocket()
  const [users, setUsers] = useState<{ [K: string]: RoomUser }>({})
  const [remoteCanvasRefs, setRemoteCanvasRefs] = useState<{ [id: string]: React.RefObject<HTMLCanvasElement> }>({})
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [telemetryData, setTelemetryData] = useState<{
    [userId: string]: { latency: number; videoBitrate: number; audioBitrate: number }
  }>({})
  const telemetryInstances = useRef<{ [userId: string]: { video: NetworkTelemetry; audio: NetworkTelemetry } }>({})
  const [latencyHistory, setLatencyHistory] = useState<{ [userId: string]: number[] }>({})
  const [videoBitrateHistory, setVideoBitrateHistory] = useState<{ [userId: string]: number[] }>({})
  const [audioBitrateHistory, setAudioBitrateHistory] = useState<{ [userId: string]: number[] }>({})
  const [timeRemaining, setTimeRemaining] = useState<string>('--:--')
  const [timeRemainingColor, setTimeRemainingColor] = useState<string>('text-green-400')
  const selfVideoRef = useRef<HTMLVideoElement>(null)
  const selfMediaStream = useRef<MediaStream | null>(null)
  const publisherInitialized = useRef<boolean>(false)
  const moqtailClientInitStarted = useRef<boolean>(false)
  const videoEncoderObjRef = useRef<any>(null)
  const audioEncoderObjRef = useRef<any>(null)
  const chatSenderRef = useRef<{ send: (msg: string) => void } | null>(null)
  const offsetRef = useRef<number>(0)
  const [mediaReady, setMediaReady] = useState(false)
  const [showInfoCards, setShowInfoCards] = useState<{ [userId: string]: boolean }>({})
  const [infoPanelType, setInfoPanelType] = useState<{ [userId: string]: 'network' | 'codec' }>({})
  const [codecData, setCodecData] = useState<{
    [userId: string]: {
      videoCodec: string
      audioCodec: string
      frameRate: number
      sampleRate: number
      resolution: string
      syncDrift: number
      videoBitrate?: number
      audioBitrate?: number
      numberOfChannels?: number
    }
  }>({})

  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const [isUserScrolling, setIsUserScrolling] = useState(false)
  const [userColors, setUserColors] = useState<{ [userId: string]: { bgClass: string; hexColor: string } }>({})
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const emojiCategories = {
    Faces: ['😀', '😂', '😍', '😊', '😉', '😎', '🤔', '😮', '😢', '😭', '😡', '🤯', '🙄', '😴'],
    Gestures: ['👍', '👎', '👏', '🙌', '👋', '✌️', '🤞', '🤝', '🙏', '💪', '👌', '🤟', '✊', '👊'],
    Hearts: ['⚡️', '💯', '⭐', '✅', '⏳'],
    Objects: ['🎉', '🎊', '🎈', '🎁', '🎂', '🎵', '🏆', '🎯'],
  }

  const allEmojis = Object.values(emojiCategories).flat()

  const quickEmojis = ['👍', '⚡️', '😀', '😂', '✅', '🎉']

  const addEmoji = (emoji: string) => {
    const input = chatInputRef.current
    if (input) {
      const start = input.selectionStart || 0
      const end = input.selectionEnd || 0
      const newValue = chatMessage.slice(0, start) + emoji + chatMessage.slice(end)
      setChatMessage(newValue)

      setTimeout(() => {
        const newCursorPos = start + emoji.length
        input.setSelectionRange(newCursorPos, newCursorPos)
        input.focus()
      }, 0)
    } else {
      setChatMessage((prev) => prev + emoji)
    }
    setShowEmojiPicker(false)
  }

  const renderMessageWithEmojis = (text: string) => {
    const emojiOnlyRegex = /^[\p{Emoji_Presentation}\p{Emoji}\uFE0F\s]+$/u
    const isEmojiOnly = emojiOnlyRegex.test(text) && text.trim().length <= 10 // Max 10 chars for emoji-only

    if (isEmojiOnly) {
      return <span style={{ fontSize: '2em', lineHeight: '1' }}>{text}</span>
    }

    const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/gu
    const parts = text.split(emojiRegex)

    return parts.map((part, index) => {
      if (emojiRegex.test(part)) {
        return (
          <span
            key={index}
            style={{
              fontSize: '1.2em',
              lineHeight: '1.2',
              display: 'inline-block',
              margin: '0 1px',
            }}
          >
            {part}
          </span>
        )
      }
      return part
    })
  }

  const handleSendMessage = async () => {
    if (chatMessage.trim()) {
      // Format timestamp as h.mmAM/PM
      const now = new Date()
      let hours = now.getHours()
      const minutes = now.getMinutes()
      const ampm = hours >= 12 ? 'PM' : 'AM'
      hours = hours % 12
      hours = hours ? hours : 12
      const formattedMinutes = minutes < 10 ? '0' + minutes : minutes
      const formattedTime = `${hours}:${formattedMinutes}${ampm}`
      if (chatSenderRef.current) {
        chatSenderRef.current.send(
          JSON.stringify({
            sender: username,
            message: chatMessage,
            timestamp: formattedTime,
          }),
        )
      }
      setChatMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(10).slice(2),
          sender: username,
          message: chatMessage,
          timestamp: formattedTime,
        },
      ])
      setChatMessage('')
    }
  }

  const addUser = (user: RoomUser): void => {
    setUsers((prev) => {
      const users = { ...prev }
      users[user.id] = user
      return users
    })
  }

  const isSelf = (id: string): boolean => {
    return id === userId
  }

  const getUserInitials = (name: string): string => {
    const words = name.trim().split(/\s+/)

    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase()
    } else {
      return words

        .slice(0, 2)

        .map((word) => word.charAt(0))

        .join('')

        .toUpperCase()
    }
  }

  const availableColors = [
    { bgClass: 'bg-blue-500', hexColor: '#3b82f6' },

    { bgClass: 'bg-green-500', hexColor: '#22c55e' },

    { bgClass: 'bg-purple-500', hexColor: '#a855f7' },

    { bgClass: 'bg-red-500', hexColor: '#ff0000' },

    { bgClass: 'bg-orange-500', hexColor: '#f97316' },

    { bgClass: 'bg-teal-500', hexColor: '#14b8a6' },
  ]

  const getUserColor = (userId: string): string => {
    return userColors[userId]?.bgClass || 'bg-gray-500'
  }

  const toggleInfoCard = (userId: string, panelType: 'network' | 'codec' = 'network') => {
    setShowInfoCards((prev) => ({
      ...prev,
      [userId]: !prev[userId] || infoPanelType[userId] !== panelType ? true : false,
    }))

    setInfoPanelType((prev) => ({
      ...prev,
      [userId]: panelType,
    }))
  }

  const getUserColorHex = (userId: string): string => {
    return userColors[userId]?.hexColor || '#6b7280'
  }

  const getSenderUserId = (senderName: string): string => {
    const user = Object.values(users).find((u) => u.name === senderName)

    return user?.id || ''
  }

  const handleToggle = (kind: 'mic' | 'cam') => {
    // If trying to toggle camera while screen sharing, stop screen sharing first

    if (kind === 'cam' && isScreenSharing) {
      handleToggleScreenShare() // This will stop screen sharing

      // After screen sharing stops, toggle the camera

      setTimeout(() => {
        const setter = setisCamOn

        setter((prev) => {
          const newValue = !prev

          setUsers((users) => {
            const u = users[userId]

            users[userId] = { ...u, hasVideo: newValue }

            // Video track switching logic for camera

            const audioTrack = selfMediaStream.current?.getAudioTracks()[0]

            let newStream

            if (newValue) {
              navigator.mediaDevices.getUserMedia({ video: { aspectRatio: 16 / 9 } }).then((videoStream) => {
                const realVideoTrack = videoStream.getVideoTracks()[0]

                const oldVideoTrack = selfMediaStream.current?.getVideoTracks()[0]

                if (oldVideoTrack) {
                  oldVideoTrack.stop()

                  selfMediaStream.current?.removeTrack(oldVideoTrack)
                }

                newStream = new MediaStream()

                if (audioTrack) newStream.addTrack(audioTrack)

                newStream.addTrack(realVideoTrack)

                selfMediaStream.current = newStream

                if (videoEncoderObjRef.current) {
                  videoEncoderObjRef.current.offset = offsetRef.current

                  videoEncoderObjRef.current.start(selfMediaStream.current)
                }

                if (selfVideoRef.current) {
                  selfVideoRef.current.srcObject = newStream

                  selfVideoRef.current.muted = true
                }
              })
            } else {
              const oldVideoTrack = selfMediaStream.current?.getVideoTracks()[0]

              if (oldVideoTrack) {
                oldVideoTrack.stop()

                selfMediaStream.current?.removeTrack(oldVideoTrack)
              }

              newStream = new MediaStream()

              if (audioTrack) newStream.addTrack(audioTrack)

              selfMediaStream.current = newStream

              if (selfVideoRef.current) selfVideoRef.current.srcObject = newStream

              selfVideoRef.current!.muted = true

              if (videoEncoderObjRef.current) {
                videoEncoderObjRef.current.stop()
              }
            }

            return users
          })

          contextSocket?.emit('toggle-button', { kind, value: newValue })

          return newValue
        })
      }, 100) // Small delay to ensure screen sharing stops first

      return
    }
    const setter = kind === 'mic' ? setIsMicOn : setisCamOn
    setter((prev) => {
      const newValue = !prev
      setUsers((users) => {
        const u = users[userId]
        if (kind === 'mic') {
          users[userId] = { ...u, hasAudio: newValue }
          toggleMediaStreamAudio(newValue)
          if (audioEncoderObjRef.current) {
            audioEncoderObjRef.current.setEncoding(newValue)
          }
        } else if (kind === 'cam') {
          users[userId] = { ...u, hasVideo: newValue }
          // --- Video track switching logic ---
          const audioTrack = selfMediaStream.current?.getAudioTracks()[0]
          let newStream
          if (newValue) {
            navigator.mediaDevices.getUserMedia({ video: { aspectRatio: 16 / 9 } }).then((videoStream) => {
              const realVideoTrack = videoStream.getVideoTracks()[0]
              const oldVideoTrack = selfMediaStream.current?.getVideoTracks()[0]
              if (oldVideoTrack) {
                oldVideoTrack.stop()
                selfMediaStream.current?.removeTrack(oldVideoTrack)
              }
              newStream = new MediaStream()
              if (audioTrack) newStream.addTrack(audioTrack)
              newStream.addTrack(realVideoTrack)
              selfMediaStream.current = newStream
              if (videoEncoderObjRef.current) {
                videoEncoderObjRef.current.offset = offsetRef.current
                videoEncoderObjRef.current.start(selfMediaStream.current)
              }
              if (selfVideoRef.current) {
                selfVideoRef.current.srcObject = newStream
                selfVideoRef.current.muted = true // Ensure muted
              }
            })
          } else {
            const oldVideoTrack = selfMediaStream.current?.getVideoTracks()[0]
            if (oldVideoTrack) {
              oldVideoTrack.stop() // This will turn off the camera indicator
              selfMediaStream.current?.removeTrack(oldVideoTrack)
            }
            newStream = new MediaStream()
            if (audioTrack) newStream.addTrack(audioTrack)
            selfMediaStream.current = newStream
            if (selfVideoRef.current) selfVideoRef.current.srcObject = newStream
            selfVideoRef.current!.muted = true
            if (videoEncoderObjRef.current) {
              videoEncoderObjRef.current.stop()
            }
          }
        }
        return users
      })
      contextSocket?.emit('toggle-button', { kind, value: newValue })
      return newValue
    })
  }

  function toggleMediaStreamAudio(val: boolean) {
    const mediaStream = selfMediaStream.current!
    if (mediaStream) {
      const tracks = mediaStream.getAudioTracks()
      tracks.forEach((track) => (track.enabled = val))
    }
  }

  const handleToggleCam = () => {
    handleToggle('cam')
  }
  const handleToggleMic = () => {
    handleToggle('mic')
  }

  const handleToggleScreenShare = async () => {
    if (!isScreenSharing) {
      const someoneSharing = Object.values(users).some((u) => u.hasScreenshare && u.id !== userId)
      if (!isScreenSharing && someoneSharing) {
        alert('Only one person can share their screen at a time.')
        return
      }
      const oldVideoTrack = selfMediaStream.current?.getVideoTracks()[0]
      if (oldVideoTrack) {
        oldVideoTrack.stop()
        selfMediaStream.current?.removeTrack(oldVideoTrack)
      }

      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        const screenTrack = screenStream.getVideoTracks()[0]
        const audioTrack = selfMediaStream.current?.getAudioTracks()[0]
        const newStream = new MediaStream()
        if (audioTrack) newStream.addTrack(audioTrack)
        newStream.addTrack(screenTrack)
        selfMediaStream.current = newStream
        if (selfVideoRef.current) selfVideoRef.current.srcObject = newStream
        if (selfVideoRef.current) selfVideoRef.current.muted = true // Ensure muted
        if (videoEncoderObjRef.current) {
          videoEncoderObjRef.current.offset = offsetRef.current
          videoEncoderObjRef.current.start(selfMediaStream.current)
        }
        setIsScreenSharing(true)
        contextSocket?.emit('screen-share-toggled', { userId, hasScreenshare: true })
        setUsers((users) => ({
          ...users,
          [userId]: { ...users[userId], hasScreenshare: true, hasVideo: true },
        }))
        screenTrack.onended = () => {
          setIsScreenSharing(false)
          setisCamOn(false) // Turn off video button state
          contextSocket?.emit('screen-share-toggled', { userId, hasScreenshare: false })
          setUsers((users) => ({
            ...users,
            [userId]: { ...users[userId], hasScreenshare: false, hasVideo: false },
          }))
          handleRestoreCameraAfterScreenShare()
        }
      } catch (err) {
        console.error('Failed to start screen sharing', err)
      }
    } else {
      const screenTrack = selfMediaStream.current?.getVideoTracks()[0]
      if (screenTrack) {
        screenTrack.stop()
        selfMediaStream.current?.removeTrack(screenTrack)
      }
      setIsScreenSharing(false)
      setisCamOn(false) // Turn off video button state
      contextSocket?.emit('screen-share-toggled', { userId, hasScreenshare: false })
      setUsers((users) => ({
        ...users,
        [userId]: { ...users[userId], hasScreenshare: false, hasVideo: false },
      }))
      handleRestoreCameraAfterScreenShare()
    }
  }

  function handleRestoreCameraAfterScreenShare() {
    const audioTrack = selfMediaStream.current?.getAudioTracks()[0]
    const newStream = new MediaStream()
    if (audioTrack) newStream.addTrack(audioTrack)
    // Always turn off video when screen share ends
    selfMediaStream.current = newStream
    if (selfVideoRef.current) selfVideoRef.current.srcObject = newStream
    selfVideoRef.current!.muted = true
    if (videoEncoderObjRef.current) {
      videoEncoderObjRef.current.stop()
    }
  }

  useEffect(() => {
    async function startPublisher() {
      try {
        //console.log('Starting publisher for user:', userId);
        if (!userId) {
          console.error('User ID is not defined')
          return
        }
        if (!roomState) {
          console.error('Room state is not defined')
          return
        }

        selfMediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
        const audioTracks = selfMediaStream.current.getAudioTracks()
        audioTracks.forEach((track) => (track.enabled = false))

        //console.log('Got user media:', selfMediaStream.current);
        setMediaReady(true)

        if (selfVideoRef.current) {
          selfVideoRef.current.srcObject = selfMediaStream.current
          selfVideoRef.current.muted = true // Ensure muted
          //console.log('Set video srcObject');
        } else {
          console.error('selfVideoRef.current is null')
          return
        }
        const roomName = roomState?.name
        if (!roomName) {
          console.error('Room name is not defined')
          return
        }

        const videoFullTrackName = getTrackname(roomName, userId, 'video')
        const audioFullTrackName = getTrackname(roomName, userId, 'audio')
        const chatFullTrackName = getTrackname(roomName, userId, 'chat')
        //console.log('Constructed track names:', videoFullTrackName, audioFullTrackName);

        const selfUser = roomState.users[userId]
        if (!selfUser) {
          console.error('Self user not found in room state: %s', userId)
          return
        }
        //console.log('Self user found:', selfUser);
        const videoTrack = selfUser?.publishedTracks['video']
        const videoTrackAlias = videoTrack?.alias

        const audioTrack = selfUser?.publishedTracks['audio']
        const audioTrackAlias = audioTrack?.alias

        const chatTrack = selfUser?.publishedTracks['chat']
        const chatTrackAlias = chatTrack?.alias

        if (isNaN(videoTrackAlias ?? undefined)) {
          console.error('Video track alias not found for user:', userId)
          return
        }
        if (isNaN(audioTrackAlias ?? undefined)) {
          console.error('Audio track alias not found for user:', userId)
          return
        }

        const normalizer = await ClockNormalizer.create(
          window.appSettings.clockNormalizationConfig.timeServerUrl,
          window.appSettings.clockNormalizationConfig.numberOfSamples,
        )
        const offset = normalizer.getSkew()
        offsetRef.current = offset
        announceNamespaces(moqClient!, videoFullTrackName.namespace)
        let tracks = setupTracks(
          moqClient!,
          audioFullTrackName,
          videoFullTrackName,
          chatFullTrackName,
          BigInt(audioTrackAlias),
          BigInt(videoTrackAlias),
          BigInt(chatTrackAlias),
        )

        videoEncoderObjRef.current = initializeVideoEncoder({
          videoFullTrackName,
          videoStreamController: tracks.getVideoStreamController(),
          publisherPriority: 1,
          offset,
          objectForwardingPreference: ObjectForwardingPreference.Subgroup,
        })
        // Only start video encoder if we have video tracks

        const hasVideoTrack = selfMediaStream.current.getVideoTracks().length > 0

        let videoPromise: Promise<any> = Promise.resolve()

        if (hasVideoTrack) {
          videoPromise = videoEncoderObjRef.current.start(selfMediaStream.current)
        }
        const audioPromise = startAudioEncoder({
          stream: selfMediaStream.current,
          audioFullTrackName,
          audioStreamController: tracks.getAudioStreamController(),
          publisherPriority: 1,
          audioGroupId: 0,
          offset,
          objectForwardingPreference: ObjectForwardingPreference.Subgroup,
        }).then((audioEncoderResult) => {
          audioEncoderObjRef.current = audioEncoderResult
          audioEncoderObjRef.current.setEncoding(isMicOn)
          return audioEncoderResult
        })
        chatSenderRef.current = initializeChatMessageSender({
          chatFullTrackName,
          chatStreamController: tracks.getChatStreamController(),
          publisherPriority: 1,
          objectForwardingPreference: ObjectForwardingPreference.Subgroup,
          offset,
        })

        await Promise.all([videoPromise, audioPromise])

        // send announce update to the socket server
        // so that the other clients are notified
        // and they can subscribe
        const updateTrackRequest: UpdateTrackRequest = {
          trackType: 'video',
          event: 'announce',
        }
        contextSocket?.emit('update-track', updateTrackRequest)

        updateTrackRequest.trackType = 'audio'
        contextSocket?.emit('update-track', updateTrackRequest)

        updateTrackRequest.trackType = 'chat'
        contextSocket?.emit('update-track', updateTrackRequest)
      } catch (err) {
        console.error('Error in publisher setup:', err)
      }
    }
    //console.log('before startPublisher', moqClient, userId, selfVideoRef.current, publisherInitialized)
    if (moqClient && userId && selfVideoRef.current && !publisherInitialized.current) {
      publisherInitialized.current = true
      setTimeout(async () => {
        try {
          await startPublisher()
          //console.log('startPublisher done')
        } catch (err) {
          console.error('error in startPublishing', err)
        }
      }, 1000)
    }
  }, [userId, roomState, moqClient])

  useEffect(() => {
    if (!username || !roomState) {
      leaveRoom()
      return
    }

    if (!moqtailClientInitStarted.current) {
      moqtailClientInitStarted.current = true

      const initClient = async () => {
        const client = await connectToRelay(relayUrl + '/' + username)
        setMoqClient(client)
        //console.log('initClient', client)
        if (roomState && Object.values(users).length === 0) {
          const otherUsers = Object.keys(roomState.users).filter((uId) => uId != userId)
          setUsers(roomState.users)

          Object.keys(roomState.users).forEach((uId) => initializeTelemetryForUser(uId))
          const canvasRefs = Object.fromEntries(otherUsers.map((uId) => [uId, React.createRef<HTMLCanvasElement>()]))
          setRemoteCanvasRefs(canvasRefs)
        }
      }

      initClient()
    }

    if (!contextSocket) return
    const socket = contextSocket

    socket.on('user-joined', (user: RoomUser) => {
      console.info(`User joined: ${user.name} (${user.id})`)
      addUser(user)
      initializeTelemetryForUser(user.id)
      setRemoteCanvasRefs((prev) => ({
        ...prev,
        [user.id]: React.createRef<HTMLCanvasElement>(),
      }))
    })

    socket.on('track-updated', (response: TrackUpdateResponse) => {
      setUsers((prevUsers) => {
        //console.log('track-updated', prevUsers, response)
        const updatedUser = prevUsers[response.userId]
        if (updatedUser) {
          const track = response.track
          if (track.kind === 'video' || track.kind === 'audio' || track.kind === 'chat') {
            updatedUser.publishedTracks[track.kind] = track
          }
        }
        return { ...prevUsers }
      })
    })

    socket.on('button-toggled', (response: ToggleResponse) => {
      setUsers((prevUsers) => {
        const updatedUsers = { ...prevUsers }
        const user = updatedUsers[response.userId]
        if (user) {
          if (response.kind === 'mic') {
            user.hasAudio = response.value
          }
          if (response.kind === 'cam') {
            user.hasVideo = response.value
          }
        }
        return updatedUsers
      })
    })
    socket.on('screen-share-toggled', ({ userId: toggledUserId, hasScreenshare }) => {
      setUsers((prevUsers) => {
        if (!prevUsers[toggledUserId]) return prevUsers
        return {
          ...prevUsers,
          [toggledUserId]: {
            ...prevUsers[toggledUserId],
            hasVideo: hasScreenshare,
            hasScreenshare,
          },
        }
      })
    })

    socket.on('user-disconnect', (msg: UserDisconnectedMessage) => {
      console.info(`User disconnected: ${msg.userId}`)
      setUsers((prev) => {
        const users = { ...prev }
        delete users[msg.userId]
        return users
      })

      const canvasRef = remoteCanvasRefs[msg.userId]

      if (canvasRef && canvasRef.current) {
        canvasRef.current.remove()
      }

      setRemoteCanvasRefs((prev) => {
        const newRefs = { ...prev }
        delete newRefs[msg.userId]
        return newRefs
      })

      delete telemetryInstances.current[msg.userId]
      delete previousValues.current[msg.userId]
      setTelemetryData((prev) => {
        const newData = { ...prev }
        delete newData[msg.userId]
        return newData
      })
      setCodecData((prev) => {
        const newData = { ...prev }
        delete newData[msg.userId]
        return newData
      })
      setLatencyHistory((prev) => {
        const newHistory = { ...prev }
        delete newHistory[msg.userId]
        return newHistory
      })
      setVideoBitrateHistory((prev) => {
        const newHistory = { ...prev }
        delete newHistory[msg.userId]
        return newHistory
      })
      setAudioBitrateHistory((prev) => {
        const newHistory = { ...prev }
        delete newHistory[msg.userId]
        return newHistory
      })
      // Clean up user color

      setUserColors((prev) => {
        const newColors = { ...prev }

        delete newColors[msg.userId]

        return newColors
      })
      // TODO: unsubscribe
    })

    socket.on('room-timeout', (msg: RoomTimeoutMessage) => {
      console.info('Room timeout:', msg.message)
      alert(`${msg.message}\n\nYou will be redirected to the home page.`)

      leaveRoom()
    })

    return () => {
      socket.off('user-joined')
      socket.off('track-updated')
      socket.off('button-toggled')
      socket.off('user-disconnect')
      socket.off('room-timeout')
      socket.off('screen-share-toggled')
    }
  }, [contextSocket])

  useEffect(() => {
    const assignColors = () => {
      const assigned = { ...userColors }
      const used = new Set(Object.values(assigned).map((c) => c.bgClass))

      Object.keys(users).forEach((uid) => {
        if (!assigned[uid]) {
          const available = availableColors.find((c) => !used.has(c.bgClass))
          if (available) {
            assigned[uid] = available
            used.add(available.bgClass)
          } else {
            // fallback: assign gray if colors are exhausted
            assigned[uid] = { bgClass: 'bg-gray-500', hexColor: '#6b7280' }
          }
        }
      })
      setUserColors(assigned)
    }

    assignColors()
  }, [users])

  const initializeTelemetryForUser = (userId: string) => {
    if (!telemetryInstances.current[userId]) {
      telemetryInstances.current[userId] = {
        video: new NetworkTelemetry(1000), // 1 second window
        audio: new NetworkTelemetry(1000), // 1 second window
      }

      setCodecData((prev) => ({
        ...prev,
        [userId]: isSelf(userId) ? getSelfCodecData() : getOtherParticipantCodecData(),
      }))
    }
  }

  const getSelfCodecData = () => {
    const videoConfig = window.appSettings.videoEncoderConfig
    const audioConfig = window.appSettings.audioEncoderConfig

    return {
      videoCodec: videoConfig.codec,
      audioCodec: audioConfig.codec,
      frameRate: videoConfig.framerate,
      sampleRate: audioConfig.sampleRate,
      resolution: `${videoConfig.width}x${videoConfig.height}`,
      syncDrift: 0, // TODO
      videoBitrate: videoConfig.bitrate,
      audioBitrate: audioConfig.bitrate,
      numberOfChannels: audioConfig.numberOfChannels,
    }
  }

  const getOtherParticipantCodecData = () => {
    // TODO: this should be dynamic based on actual participant data
    const videoConfig = window.appSettings.videoEncoderConfig
    const audioConfig = window.appSettings.audioEncoderConfig

    return {
      videoCodec: videoConfig.codec,
      audioCodec: audioConfig.codec,
      frameRate: videoConfig.framerate,
      sampleRate: audioConfig.sampleRate,
      resolution: `${videoConfig.width}x${videoConfig.height}`,
      syncDrift: 0, // TODO
      videoBitrate: videoConfig.bitrate,
      audioBitrate: audioConfig.bitrate,
      numberOfChannels: audioConfig.numberOfChannels,
    }
  }

  const previousValues = useRef<{ [userId: string]: { latency: number; videoBitrate: number; audioBitrate: number } }>(
    {},
  )

  // Update every 100ms
  useEffect(() => {
    const interval = setInterval(() => {
      const newTelemetryData: { [userId: string]: { latency: number; videoBitrate: number; audioBitrate: number } } = {}

      Object.keys(telemetryInstances.current).forEach((userId) => {
        const telemetry = telemetryInstances.current[userId]
        if (telemetry) {
          const videoLatency = isSelf(userId) ? 0 : Math.round(telemetry.video.latency)
          const videoBitrate = (telemetry.video.throughput * 8) / 1000 // bytes/s to Kbps
          const audioBitrate = (telemetry.audio.throughput * 8) / 1000 // bytes/s to Kbps

          newTelemetryData[userId] = {
            latency: videoLatency,
            videoBitrate: Math.max(0, videoBitrate),
            audioBitrate: Math.max(0, audioBitrate),
          }

          // Latency history (last 30 points)
          if (!isSelf(userId)) {
            setLatencyHistory((prevLatency) => {
              const userHistory = prevLatency[userId] || []
              const newHistory = [...userHistory, videoLatency].slice(-30)
              return {
                ...prevLatency,
                [userId]: newHistory,
              }
            })
          }

          // Video bitrate history (last 30 points)
          setVideoBitrateHistory((prevVideoBitrate) => {
            const userHistory = prevVideoBitrate[userId] || []
            const newHistory = [...userHistory, videoBitrate].slice(-30)
            return {
              ...prevVideoBitrate,
              [userId]: newHistory,
            }
          })

          // Audio bitrate history (last 30 points)
          setAudioBitrateHistory((prevAudioBitrate) => {
            const userHistory = prevAudioBitrate[userId] || []
            const newHistory = [...userHistory, audioBitrate].slice(-30)
            return {
              ...prevAudioBitrate,
              [userId]: newHistory,
            }
          })
        }
      })

      setTelemetryData(newTelemetryData)
    }, 100)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowEmojiPicker(false)
      }
    }

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showEmojiPicker])

  useEffect(() => {
    Object.values(remoteCanvasRefs).forEach((ref) => {
      handleRemoteVideo(ref)
    })
  }, [remoteCanvasRefs, users])

  useEffect(() => {
    const handlePopState = (_event: PopStateEvent) => {
      leaveRoom()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  // Timer
  useEffect(() => {
    if (!roomState?.created) return
    const interval = setInterval(() => {
      const now = Date.now()
      const elapsed = now - roomState.created
      const remaining = Math.max(0, 10 * 60 * 1000 - elapsed) // 10 mins
      if (remaining <= 0) {
        setTimeRemaining('0:00')
        setTimeRemainingColor('text-red-500')
        clearInterval(interval)
        return
      }

      const minutes = Math.floor(remaining / 60000)
      const seconds = Math.floor((remaining % 60000) / 1000)
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`)

      if (remaining <= 60000) {
        // 1 minute
        setTimeRemainingColor('text-red-500')
      } else if (remaining <= 120000) {
        // 2 minutes
        setTimeRemainingColor('text-yellow-400')
      } else {
        setTimeRemainingColor('text-green-400')
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [roomState?.created])

  function getUserCount() {
    return Object.entries(users).length
  }

  function getTrackname(roomName: string, userId: string, kind: 'video' | 'audio' | 'chat'): FullTrackName {
    // Returns a FullTrackName for the given room, user, and track kind
    return FullTrackName.tryNew(Tuple.fromUtf8Path(`/moqtail/${roomName}/${userId}`), new TextEncoder().encode(kind))
  }

  function handleRemoteVideo(canvasRef: React.RefObject<HTMLCanvasElement>) {
    //console.log('handleRemoteVideo init', canvasRef)
    if (!canvasRef?.current) return
    if (!moqClient) return
    if (canvasRef.current.dataset.status) return

    const userId = canvasRef.current.id
    const roomName = roomState?.name!
    const videoTrackAlias = parseInt(canvasRef.current.dataset.videotrackalias || '-1')
    const audioTrackAlias = parseInt(canvasRef.current.dataset.audiotrackalias || '-1')
    const chatTrackAlias = parseInt(canvasRef.current.dataset.chattrackalias || '-1')
    const announced = parseInt(canvasRef.current.dataset.announced || '0')
    //console.log('handleRemoteVideo', canvasRef.current.id, moqClient, roomName, videoTrackAlias, audioTrackAlias, announced)
    if (announced > 0 && videoTrackAlias > 0 && audioTrackAlias > 0 && chatTrackAlias > 0)
      setTimeout(async () => {
        await subscribeToTrack(roomName, userId, videoTrackAlias, audioTrackAlias, chatTrackAlias, canvasRef)
      }, 500)
  }

  async function subscribeToTrack(
    roomName: string,
    userId: string,
    videoTrackAlias: number,
    audioTrackAlias: number,
    chatTrackAlias: number,
    canvasRef: React.RefObject<HTMLCanvasElement>,
    client: MoqtailClient | undefined = undefined,
  ) {
    try {
      const the_client = client ? client : moqClient!
      //console.log('subscribeToTrack', roomName, userId, videoTrackAlias, audioTrackAlias, canvasRef)
      // TODO: sub to audio and video seperately
      // for now, we just check the video announced date
      if (canvasRef.current && !canvasRef.current.dataset.status) {
        //console.log("subscribeToTrack - Now will try to subscribe")
        const videoFullTrackName = getTrackname(roomName, userId, 'video')
        const audioFullTrackName = getTrackname(roomName, userId, 'audio')
        const chatFullTrackName = getTrackname(roomName, userId, 'chat')
        canvasRef.current!.dataset.status = 'pending'
        // Initialize telemetry for this user if not already done
        initializeTelemetryForUser(userId)
        const userTelemetry = telemetryInstances.current[userId]

        //console.log("subscribeToTrack - Use video subscriber called", videoTrackAlias, audioTrackAlias, videoFullTrackName, audioFullTrackName)
        // Subscribe to video and audio
        const videoResult = await useVideoSubscriber(
          the_client,
          canvasRef,
          videoTrackAlias,
          audioTrackAlias,
          videoFullTrackName,
          audioFullTrackName,
          userTelemetry.video,
          userTelemetry.audio,
        )()

        // Subscribe to chat if we have a valid chat track alias
        if (chatTrackAlias > 0) {
          console.log('Subscribing to chat track with alias:', chatTrackAlias)
          try {
            await subscribeToChatTrack({
              moqClient: the_client,
              chatTrackAlias: chatTrackAlias,
              chatFullTrackName,
              onMessage: (msgObj) => {
                setChatMessages((prev) => [
                  ...prev,
                  {
                    id: Math.random().toString(10).slice(2),
                    sender: msgObj.sender,
                    message: msgObj.message,
                    timestamp: msgObj.timestamp,
                  },
                ])
              },
            })
            console.log('Successfully subscribed to chat for user:', userId)
          } catch (error) {
            console.error('Failed to subscribe to chat for user:', userId, error)
          }
        } else {
          console.warn('Chat track alias is invalid or not set:', chatTrackAlias, 'for user:', userId)
          // Try to subscribe to chat later with a retry mechanism
          setTimeout(async () => {
            console.log('Retrying chat subscription for user:', userId)
            const retrychatTrackAlias = parseInt(canvasRef.current?.dataset.chattrackalias || '-1')
            if (retrychatTrackAlias > 0) {
              try {
                await subscribeToChatTrack({
                  moqClient: the_client,
                  chatTrackAlias: retrychatTrackAlias,
                  chatFullTrackName,
                  onMessage: (msgObj) => {
                    setChatMessages((prev) => [
                      ...prev,
                      {
                        id: Math.random().toString(10).slice(2),
                        sender: msgObj.sender,
                        message: msgObj.message,
                        timestamp: msgObj.timestamp,
                      },
                    ])
                  },
                })
                console.log('Successfully subscribed to chat on retry for user:', userId)
              } catch (error) {
                console.error('Failed to subscribe to chat on retry for user:', userId, error)
              }
            } else {
              console.warn('Chat track alias still invalid on retry for user:', userId)
            }
          }, 2000) // Wait 2 seconds before retrying chat subscription
        }
        //console.log('subscribeToTrack result', result)
        // TODO: result comes true all the time, refactor...
        canvasRef.current!.dataset.status = videoResult ? 'playing' : ''
      }
    } catch (err) {
      console.error('Error in subscribing', roomName, userId, err)
      // reset status
      if (canvasRef.current) canvasRef.current.dataset.status = ''
    }
  }

  function leaveRoom() {
    //console.log('Leaving room...');

    setMoqClient(undefined)
    if (selfMediaStream.current) {
      const tracks = selfMediaStream.current.getTracks()
      tracks.forEach((track) => {
        track.stop()
      })
      selfMediaStream.current = null
    }

    if (videoEncoderObjRef.current && videoEncoderObjRef.current.stop) {
      //console.log('Stopping video encoder...');
      videoEncoderObjRef.current.stop()
      videoEncoderObjRef.current = null
    }

    if (audioEncoderObjRef.current) {
      audioEncoderObjRef.current = null
    }

    if (selfVideoRef.current) {
      selfVideoRef.current.srcObject = null
    }

    if (contextSocket && contextSocket.connected) {
      contextSocket.disconnect()
    }
    moqClient?.disconnect()

    cleanupClockNormalizer()

    clearSession()

    window.location.href = '/'
  }

  useEffect(() => {
    if (chatMessagesRef.current && !isUserScrolling) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }, [chatMessages, isUserScrolling])

  const handleChatScroll = () => {
    if (chatMessagesRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatMessagesRef.current
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5 // 5px tolerance
      setIsUserScrolling(!isAtBottom)
    }
  }

  const userCount = getUserCount()

  const usersPerPage = 3
  const [pageIndex, setPageIndex] = useState(0)

  const userList = Object.entries(users)
    .sort((a, b) => (isSelf(b[0]) ? 1 : 0) - (isSelf(a[0]) ? 1 : 0))
    .map((item) => item[1])
    .slice(0, 6)

  useEffect(() => {
    if (pageIndex > 0 && userCount <= 3) {
      setPageIndex(0)
    }
  }, [userCount, pageIndex])

  const [isSmallScreen, setIsSmallScreen] = useState(false)

  useEffect(() => {
    function handleResize() {
      setIsSmallScreen(window.innerWidth < 768)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const usersToRender = isSmallScreen ? (pageIndex === 0 ? userList.slice(0, 3) : userList.slice(3, 6)) : userList

  return (
    <div className="h-screen bg-gray-900 flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="bg-gray-800 px-6 py-3 flex justify-between items-center border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <h1 className="text-white text-xl font-semibold">MOQtail Demo - Room: {roomState?.name}</h1>
          <div className="flex items-center space-x-2 text-gray-300">
            <Users className="w-4 h-4" />
            <span className="text-sm">
              {getUserCount()} participant{userCount > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className={`flex items-center space-x-2 ${timeRemainingColor}`}>
          <span className="text-base font-semibold">⏱️ Remaining Time: {timeRemaining}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Video Grid Area */}
        <div className={`flex-1 p-4 ${isChatOpen ? 'pr-2' : 'pr-4'} min-h-0`}>
          <div className="grid gap-3 h-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
            {usersToRender.map((user) => (
              <div
                key={user.id}
                className={`bg-gray-800 rounded-lg overflow-hidden group aspect-video transition-all duration-300 ${
                  maximizedUserId === user.id
                    ? 'absolute inset-0 w-full h-full z-20'
                    : maximizedUserId
                      ? 'hidden'
                      : 'relative'
                }`}
              >
                {isSelf(user.id) ? (
                  <>
                    {/* Self participant video and canvas refs */}
                    <video
                      ref={selfVideoRef}
                      autoPlay
                      muted
                      style={{
                        transform: isScreenSharing ? 'none' : 'scaleX(-1)',
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    {/* Show initials when video is off */}
                    {!user.hasVideo && !isScreenSharing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
                        <div
                          className={`w-20 h-20 rounded-full flex items-center justify-center ${getUserColor(user.id)}`}
                        >
                          <div className="text-white text-2xl font-bold">{getUserInitials(user.name)}</div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <canvas
                      ref={remoteCanvasRefs[user.id]}
                      id={user.id}
                      data-videotrackalias={user?.publishedTracks?.video?.alias}
                      data-audiotrackalias={user?.publishedTracks?.audio?.alias}
                      data-chattrackalias={user?.publishedTracks?.chat?.alias}
                      data-announced={user?.publishedTracks?.video?.announced}
                      className="w-full h-full object-cover"
                    />
                    {/* Show initials when remote video is off */}
                    {!user.hasVideo && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
                        <div
                          className={`w-20 h-20 rounded-full flex items-center justify-center ${getUserColor(user.id)}`}
                        >
                          <div className="text-white text-2xl font-bold">{getUserInitials(user.name)}</div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {/* Participant Info Overlay */}
                <div className="absolute bottom-3 left-3 right-3 flex justify-between items-center">
                  <div className="bg-black bg-opacity-60 px-2 py-1 rounded text-white text-sm font-medium">
                    <div>
                      {user.name} {isSelf(user.id) && '(You)'}
                    </div>
                    {telemetryData[user.id] &&
                      !isSelf(user.id) && ( // TODO: Calculate throughputs for self user
                        <div className="hidden md:block text-xs text-gray-300 mt-1">
                          {telemetryData[user.id].latency}ms | {telemetryData[user.id].videoBitrate.toFixed(0)}Kbit/s |{' '}
                          {telemetryData[user.id].audioBitrate.toFixed(0)}Kbit/s
                        </div>
                      )}
                  </div>
                  <div className="flex space-x-1">
                    <div className={user.hasAudio ? 'bg-gray-700 p-1 rounded' : 'bg-red-600 p-1 rounded'}>
                      {user.hasAudio ? (
                        <Mic className="w-3 h-3 text-white" />
                      ) : (
                        <MicOff className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div className={user.hasVideo ? 'bg-gray-700 p-1 rounded' : 'bg-red-600 p-1 rounded'}>
                      {user.hasVideo ? (
                        <Video className="w-3 h-3 text-white" />
                      ) : (
                        <VideoOff className="w-3 h-3 text-white" />
                      )}
                    </div>
                  </div>
                </div>
                {/* Screen sharing indicator (local only for now) */}
                {user.hasScreenshare && (
                  <div className="absolute top-3 left-3 bg-green-600 px-2 py-1 rounded text-white text-xs font-medium">
                    Sharing Screen
                  </div>
                )}
                {/* Info card toggle buttons */}
                <div className="absolute top-3 right-3 flex space-x-1">
                  {/* Network Stats Button */}
                  {!isSelf(user.id) && ( // TODO: Calculate throughputs for self user
                    <button
                      onClick={() => toggleInfoCard(user.id, 'network')}
                      className={`p-1 rounded-full transition-all duration-200 ${
                        showInfoCards[user.id] && infoPanelType[user.id] === 'network'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-gray-700 hover:bg-blue-600 text-white'
                      }`}
                      title="Network Statistics"
                    >
                      <Activity className="w-4 h-4" />
                    </button>
                  )}
                  {/* Media Info Button */}
                  <button
                    onClick={() => toggleInfoCard(user.id, 'codec')}
                    className={`p-1 rounded-full transition-all duration-200 ${
                      showInfoCards[user.id] && infoPanelType[user.id] === 'codec'
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : 'bg-gray-700 hover:bg-purple-600 text-white'
                    }`}
                    title="Media Information"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                  {/* Maximize / Minimize Button — shown for all users */}
                  <button
                    onClick={() => setMaximizedUserId(maximizedUserId === user.id ? null : user.id)}
                    className="p-1 rounded-full bg-gray-700 hover:bg-gray-600 text-white"
                    title={maximizedUserId === user.id ? 'Minimize View' : 'Maximize View'}
                  >
                    {maximizedUserId === user.id ? <Minimize className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
                  </button>
                </div>

                {/* Info card overlay */}
                {showInfoCards[user.id] && (
                  <div className="absolute inset-0 bg-white flex flex-col p-3 rounded-lg overflow-hidden">
                    {/* Close button */}
                    <div className="absolute top-3 right-3 z-10">
                      <button
                        onClick={() => toggleInfoCard(user.id, infoPanelType[user.id] || 'network')}
                        className="p-1 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-600 transition-all duration-200"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="w-full h-full flex flex-col min-h-0">
                      {/* Conditional rendering based on panel type */}
                      {!infoPanelType[user.id] || infoPanelType[user.id] === 'network' ? (
                        <>
                          {/* Network Stats Panel */}
                          {/* Header */}
                          <div className="mb-2 flex-shrink-0">
                            <h3 className="text-lg font-bold text-black leading-tight">Network Stats</h3>
                          </div>

                          {/* Legend */}
                          <div className="grid grid-cols-3 gap-1 mb-2 flex-shrink-0">
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              <span className="text-xs font-medium text-gray-700">VIDEO</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                              <span className="text-xs font-medium text-gray-700">AUDIO</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                              <span className="text-xs font-medium text-gray-700">LATENCY</span>
                            </div>
                          </div>

                          {/* Values with smooth transitions */}
                          <div className="grid grid-cols-3 gap-1 mb-3 flex-shrink-0">
                            <span className="text-xs font-bold text-black transition-all duration-200 ease-in-out">
                              {telemetryData[user.id]
                                ? `${telemetryData[user.id].videoBitrate.toFixed(0)} Kbit/s`
                                : 'N/A'}
                            </span>
                            <span className="text-xs font-bold text-black transition-all duration-200 ease-in-out">
                              {telemetryData[user.id]
                                ? `${telemetryData[user.id].audioBitrate.toFixed(0)} Kbit/s`
                                : 'N/A'}
                            </span>
                            <span className="text-xs font-bold text-black transition-all duration-200 ease-in-out">
                              {!isSelf(user.id) && telemetryData[user.id]
                                ? `${telemetryData[user.id].latency}ms`
                                : 'N/A'}
                            </span>
                          </div>

                          {/* Network Stats Graph */}
                          <div className="flex-1 relative min-h-0">
                            {/* Graph container */}
                            <div className="h-full bg-gray-50 rounded relative overflow-hidden border border-gray-200 min-h-16">
                              {/* Left Y-axis labels (Bitrate) */}
                              <div className="absolute left-1 top-1 text-xs text-gray-500 leading-none">500K</div>
                              <div className="absolute left-1 top-1/2 text-xs text-gray-500 leading-none">250K</div>
                              <div className="absolute left-1 bottom-1 text-xs text-gray-500 leading-none">0</div>

                              {/* Right Y-axis labels (Latency) */}
                              <div className="absolute right-1 top-1 text-xs text-red-500 leading-none">200ms</div>
                              <div className="absolute right-1 top-1/2 text-xs text-red-500 leading-none">100ms</div>
                              <div className="absolute right-1 bottom-1 text-xs text-red-500 leading-none">0ms</div>

                              {/* Grid lines */}
                              <div className="absolute inset-0 flex flex-col justify-between p-1">
                                {[...Array(3)].map((_, i) => (
                                  <div key={i} className="border-t border-gray-300 opacity-30"></div>
                                ))}
                              </div>

                              {/* Video bitrate line */}
                              <div className="absolute inset-0 p-2">
                                <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                                  <polyline
                                    fill="none"
                                    stroke="#3b82f6"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    points={
                                      videoBitrateHistory[user.id] && videoBitrateHistory[user.id].length > 0
                                        ? videoBitrateHistory[user.id]
                                            .map((videoBitrate, index) => {
                                              const x =
                                                (index / Math.max(videoBitrateHistory[user.id].length - 1, 1)) * 300
                                              const y = 100 - Math.min((videoBitrate / 500) * 100, 100)
                                              return `${x},${y}`
                                            })
                                            .join(' ')
                                        : ''
                                    }
                                  />
                                </svg>
                              </div>

                              {/* Audio bitrate line */}
                              <div className="absolute inset-0 p-2">
                                <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                                  <polyline
                                    fill="none"
                                    stroke="#6b7280"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    points={
                                      audioBitrateHistory[user.id] && audioBitrateHistory[user.id].length > 0
                                        ? audioBitrateHistory[user.id]
                                            .map((audioBitrate, index) => {
                                              const x =
                                                (index / Math.max(audioBitrateHistory[user.id].length - 1, 1)) * 300
                                              const y = 100 - Math.min((audioBitrate / 500) * 100, 100)
                                              return `${x},${y}`
                                            })
                                            .join(' ')
                                        : ''
                                    }
                                  />
                                </svg>
                              </div>

                              {/* Latency line */}
                              <div className="absolute inset-0 p-2">
                                <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                                  <polyline
                                    fill="none"
                                    stroke="#ef4444"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    points={
                                      !isSelf(user.id) && latencyHistory[user.id] && latencyHistory[user.id].length > 0
                                        ? latencyHistory[user.id]
                                            .map((latency: number, index: number) => {
                                              const x = (index / Math.max(latencyHistory[user.id].length - 1, 1)) * 300
                                              const y = 100 - Math.min((latency / 200) * 100, 100)
                                              return `${x},${y}`
                                            })
                                            .join(' ')
                                        : isSelf(user.id)
                                          ? '' // No line for self user
                                          : ''
                                    }
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Media Info Panel */}
                          {/* Header */}
                          <div className="mb-2 flex-shrink-0">
                            <h3 className="text-lg font-bold text-black leading-tight">Media Info</h3>
                          </div>

                          {/* Media Information Grid*/}
                          <div className="space-y-1 flex-1 text-xs overflow-y-auto">
                            {/* Video & Audio*/}
                            <div className="bg-gray-50 rounded p-1">
                              <div className="grid grid-cols-2 gap-2">
                                {/* Video */}
                                <div>
                                  <div className="font-semibold text-blue-600 mb-1 flex items-center text-xs">
                                    <Video className="w-3 h-3 mr-1" />
                                    Video
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Codec:</span>
                                      <span className="font-medium text-black">
                                        {codecData[user.id]?.videoCodec || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Resolution:</span>
                                      <span className="font-medium text-black">
                                        {codecData[user.id]?.resolution || 'N/A'}
                                      </span>
                                    </div>

                                    {codecData[user.id]?.videoBitrate && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Bitrate:</span>
                                        <span className="font-medium text-black">
                                          {(codecData[user.id].videoBitrate! / 1000).toFixed(0)}kbps
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">FPS:</span>
                                      <span className="font-medium text-black">
                                        {codecData[user.id]?.frameRate || 'N/A'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Audio */}
                                <div>
                                  <div className="font-semibold text-green-600 mb-1 flex items-center text-xs">
                                    <Mic className="w-3 h-3 mr-1" />
                                    Audio
                                  </div>
                                  <div className="space-y-0.5">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Codec:</span>
                                      <span className="font-medium text-black">
                                        {codecData[user.id]?.audioCodec || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Sample Rate:</span>
                                      <span className="font-medium text-black">
                                        {codecData[user.id]?.sampleRate
                                          ? (codecData[user.id].sampleRate / 1000).toFixed(0) + 'k'
                                          : '48k'}
                                      </span>
                                    </div>
                                    {codecData[user.id]?.audioBitrate && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Bitrate:</span>
                                        <span className="font-medium text-black">
                                          {(codecData[user.id].audioBitrate! / 1000).toFixed(0)}kbps
                                        </span>
                                      </div>
                                    )}
                                    {codecData[user.id]?.numberOfChannels && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Channels:</span>
                                        <span className="font-medium text-black">
                                          {codecData[user.id].numberOfChannels}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Sync Information */}
                            <div className="bg-gray-50 rounded p-1">
                              <div className="font-semibold text-purple-600 mb-1 flex items-center text-xs">
                                <Activity className="w-3 h-3 mr-1" />
                                Sync & Buffer
                              </div>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                <div className="flex justify-between">
                                  <span className="text-gray-600">A/V Drift: </span>
                                  <span className="font-semibold text-green-600">N/A</span>
                                  {/* <span className={`font-semibold ${Math.abs(codecData[user.id]?.syncDrift || 0) > 10 ? 'text-red-600' : 'text-green-600'}`}> */}
                                  {/* {codecData[user.id]?.syncDrift !== undefined */}
                                  {/* ? `${codecData[user.id].syncDrift > 0 ? '+' : ''}${codecData[user.id].syncDrift}ms` */}
                                  {/* : '0ms' */}
                                  {/* } */}
                                  {/* </span> */}
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Buffer duration:</span>
                                  <span className="font-semibold text-green-600">N/A</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* Chat Panel */}
        {isChatOpen && (
          <div className="w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">MOQtail Chat</h3>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors"
              >
                ×
              </button>
            </div>
            {/* Chat Messages */}
            <div
              ref={chatMessagesRef}
              className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
              onScroll={handleChatScroll}
            >
              {chatMessages.map((message) => {
                const isOwnMessage = message.sender === username
                const senderUserId = getSenderUserId(message.sender)
                return (
                  <div key={message.id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs lg:max-w-md ${isOwnMessage ? 'order-2' : 'order-1'}`}>
                      <div
                        className={`flex items-center space-x-2 mb-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                      >
                        <span
                          className={`text-sm font-medium`}
                          style={{ color: isOwnMessage ? '#3b82f6' : getUserColorHex(senderUserId) }}
                        >
                          {isOwnMessage ? 'You' : message.sender}
                        </span>
                        <span className="text-xs text-gray-500">{message.timestamp}</span>
                      </div>
                      <div
                        className={`text-sm px-3 py-2 rounded-lg ${
                          isOwnMessage
                            ? 'bg-blue-500 text-white rounded-br-none'
                            : 'bg-gray-100 text-gray-800 rounded-bl-none'
                        }`}
                        style={{
                          wordBreak: 'break-word',
                          whiteSpace: 'pre-wrap',
                          fontSize: '14px',
                          lineHeight: '1.4',
                        }}
                      >
                        {renderMessageWithEmojis(message.message)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Chat Input */}
            <div className="p-4 border-t border-gray-200 flex-shrink-0 relative">
              {/* Quick Emoji Reactions */}
              <div className="mb-3">
                <div className="flex items-center space-x-1">
                  <span className="text-xs text-gray-500 mr-2">Quick:</span>
                  {quickEmojis.map((emoji, index) => (
                    <button
                      key={index}
                      onClick={() => addEmoji(emoji)}
                      className="text-lg hover:bg-gray-100 rounded p-1 transition-colors duration-150 hover:scale-110 transform"
                      title={`Add ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Emoji Picker */}
              {showEmojiPicker && (
                <div
                  ref={emojiPickerRef}
                  className="absolute bottom-full left-4 right-4 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10"
                >
                  <div className="p-2 border-b border-gray-100">
                    <p className="text-xs text-gray-500 font-medium">Choose an emoji</p>
                  </div>
                  <div className="p-3 max-h-40 overflow-y-auto">
                    <div className="grid grid-cols-8 gap-1">
                      {allEmojis.map((emoji, index) => (
                        <button
                          key={index}
                          onClick={() => addEmoji(emoji)}
                          className="text-xl hover:bg-gray-100 rounded p-2 transition-colors duration-150 hover:scale-110 transform"
                          title={`Add ${emoji}`}
                          style={{ fontSize: '18px' }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex space-x-2">
                <div className="flex-1 relative">
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSendMessage()
                      }
                    }}
                    placeholder="Type a message..."
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded transition-colors"
                    title="Add emoji"
                  >
                    <Smile className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <button
                  onClick={handleSendMessage}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Bottom Controls */}
      <div className="bg-gray-800 px-6 py-4 flex justify-center items-center space-x-4 border-t border-gray-700 flex-shrink-0">
        {/* Mic Button */}
        <button
          onClick={handleToggleMic}
          className={`p-3 rounded-full transition-all duration-200 ${
            isMicOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
        >
          {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
        {/* Video Button */}
        <button
          onClick={handleToggleCam}
          className={`p-3 rounded-full transition-all duration-200 ${
            isCamOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
          }`}
          disabled={!mediaReady}
        >
          {isCamOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
        {/* Screen Share Button */}
        <button
          onClick={handleToggleScreenShare}
          className={`p-3 rounded-full transition-all duration-200 ${
            isScreenSharing ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'
          }`}
        >
          <MonitorUp className="w-5 h-5" />
        </button>
        {/* Pagination Buttons */}
        {userCount > usersPerPage && isSmallScreen && (
          <>
            <button
              onClick={() => setPageIndex(0)}
              disabled={pageIndex === 0}
              className="px-3 py-1 bg-gray-700 rounded text-white disabled:opacity-50"
            >
              1
            </button>
            <button
              onClick={() => setPageIndex(1)}
              disabled={pageIndex === 1}
              className="px-3 py-1 bg-gray-700 rounded text-white disabled:opacity-50"
            >
              2
            </button>
          </>
        )}
        {/* End Call Button */}
        <button
          onClick={leaveRoom}
          className="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all duration-200 ml-8"
        >
          <Phone className="w-5 h-5 transform rotate-135" />
        </button>
        {/* Chat Toggle Button (when chat is closed) */}
        {!isChatOpen && (
          <button
            onClick={() => setIsChatOpen(true)}
            className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-all duration-200"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}

export default SessionPage
