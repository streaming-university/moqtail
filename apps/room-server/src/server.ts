import http from 'http'
import { DisconnectReason, Server } from 'socket.io'
import {
  ErrorCode,
  ErrorResponse,
  JoinRequest,
  ToggleRequest,
  RoomState,
  RoomUser,
  UpdateTrackRequest,
  JoinResponse,
  TrackUpdateResponse,
  ToggleResponse,
  UserDisconnectedMessage,
  RoomStateView,
  RoomUserView,
} from './types.js'
import fs from 'fs'
import path from 'path'
import https from 'https'

let server
if (process.env.MOQTAIL_SECURE_WS) {
  // Adjust the paths as needed
  const certDir = '.'
  const options = {
    key: fs.readFileSync(path.join(certDir, 'key.pem')),
    cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
  }
  server = https.createServer(options)
  console.info('Starting server in HTTPS mode')
} else {
  server = http.createServer()
  console.info('Starting server in HTTP mode')
}

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  path: '/ws',
})

const rooms = new Map<string, RoomState>()
const userRoomMapping = new Map<string, string>()
const roomTimers = new Map<string, NodeJS.Timeout>()
let roomCounter = 0
let lastTrackAlias = 1

// constants
const MAX_ROOM_CAPACITY = 6
const MAX_ROOM_COUNT = 100
const ROOM_TIMEOUT_MS = 10 * 60 * 1000 // 10 mins (ms)

function newRoom(roomName: string) {
  const room: RoomState = {
    id: roomCounter++,
    name: roomName,
    created: Date.now(),
    users: new Map(),
  }

  const timeoutId = setTimeout(() => {
    closeRoom(roomName)
  }, ROOM_TIMEOUT_MS)

  roomTimers.set(roomName, timeoutId)
  console.info(`Room ${roomName} created with 10-minute timeout`)

  return room
}

function newUser(userId: string, username: string) {
  const user: RoomUser = {
    id: userId,
    name: username,
    joined: Date.now(),
    publishedTracks: new Map(),
    subscribedTracks: [],
    hasVideo: false,
    hasAudio: false,
    hasScreenshare: false,
  }

  // initialize tracks
  user.publishedTracks.set('video', { kind: 'video', alias: lastTrackAlias++, announced: 0, published: 0 })
  user.publishedTracks.set('audio', { kind: 'audio', alias: lastTrackAlias++, announced: 0, published: 0 })
  user.publishedTracks.set('chat', { kind: 'chat', alias: lastTrackAlias++, announced: 0, published: 0 })

  return user
}

function newError(category: string, code: ErrorCode, text: string): ErrorResponse {
  return {
    category,
    code,
    text,
  }
}

function toRoomUserView(user: RoomUser): RoomUserView {
  return {
    id: user.id,
    name: user.name,
    joined: user.joined,
    hasVideo: user.hasVideo,
    hasAudio: user.hasAudio,
    hasScreenshare: user.hasScreenshare,
    // You may need to adjust the following lines based on the RoomUserView definition
    publishedTracks: {
      video: user.publishedTracks.get('video')!,
      audio: user.publishedTracks.get('audio')!,
      chat: user.publishedTracks.get('chat')!,
    },
    subscribedTracks: user.subscribedTracks,
  }
}

function closeRoom(roomName: string) {
  console.info(`Closing room ${roomName} due to timeout`)

  const room = rooms.get(roomName)
  if (!room) {
    console.warn(`Room ${roomName} not found when trying to close`)
    return
  }

  io.to(roomName).emit('room-timeout', {
    message: `Room ${roomName} has timed out after 10 minutes and will be closed.`,
  })

  for (const [userId] of room.users) {
    userRoomMapping.delete(userId)
    const socket = io.sockets.sockets.get(userId)
    if (socket) {
      socket.leave(roomName)
      socket.disconnect(true)
    }
  }

  const timer = roomTimers.get(roomName)
  if (timer) {
    clearTimeout(timer)
    roomTimers.delete(roomName)
  }

  rooms.delete(roomName)

  console.info(`Room ${roomName} successfully closed and cleaned up`)
}

io.on('connection', (socket) => {
  console.debug('new connection', socket.id)
  socket.on('join-room', (request: JoinRequest) => {
    console.debug('join-room', request, socket.id)

    const username = request.username.trim()
    const roomName = request.roomName.trim()

    if (rooms.has(roomName)) {
      const existingRoom = rooms.get(roomName)!
      for (const user of existingRoom.users.values()) {
        if (user.name === username) {
          const errorText = `Username "${username}" already exists in room "${roomName}".`
          console.warn(errorText, socket.id)
          socket.emit('error', newError('join-room', ErrorCode.InvalidUsername, errorText))
          return
        }
      }
    }

    if (!username || !roomName) {
      const errorText = 'Username and room name are required.'
      console.warn(errorText, socket.id)
      socket.emit('error', newError('join-room', ErrorCode.InvalidRequest, errorText))
      return
    }

    if (username.length === 0 || username.length > 30) {
      const errorText = `Username must be between 1-30 characters. Given: ${username}`
      console.warn(errorText, socket.id)
      socket.emit('error', newError('join-room', ErrorCode.InvalidUsername, errorText))
      return
    }

    if (roomName.length === 0 || roomName.length > 20) {
      const errorText = `Room name must be between 1-20 characters. Given: ${roomName}`
      console.warn(errorText, socket.id)
      socket.emit('error', newError('join-room', ErrorCode.InvalidRoomName, errorText))
      return
    }

    let room = rooms.get(roomName)
    if (!room) {
      if (roomCounter >= MAX_ROOM_COUNT) {
        const errorText = `Maximum room count (${MAX_ROOM_COUNT}) is reached. Room: ${roomName}`
        console.warn(errorText, socket.id)
        socket.emit('error', newError('join-room', ErrorCode.MaxRoomReached, errorText))
        return
      }
      room = newRoom(roomName)
      rooms.set(roomName, room)
    }

    if (room?.users.size >= MAX_ROOM_CAPACITY) {
      const errorText = `Maximum user count (${MAX_ROOM_CAPACITY}) in room is reached. Room:${roomName}`
      console.warn(errorText, socket.id)
      socket.emit('error', newError('join-room', ErrorCode.MaxUserReached, errorText))
      return
    }

    const userId = socket.id
    socket.join(roomName)

    const user = newUser(userId, username)
    room!.users.set(userId, user)
    userRoomMapping.set(userId, roomName)

    console.info(`User ${username} joined room ${roomName} - ID: ${user.id}`)

    // send room state to the user
    const roomState: RoomStateView = {
      id: room.id,
      name: room.name,
      users: Object.fromEntries([...room.users].map(([id, user]) => [id, toRoomUserView(user)])),
      created: room.created,
    }
    const joinResponse: JoinResponse = {
      userId,
      roomState,
    }
    console.debug('sending joined-room', joinResponse, socket.id)
    socket.emit('joined-room', joinResponse)

    // notify other users
    console.debug('sending new-user', user, socket.id)
    socket.broadcast.to(roomName).emit('user-joined', user)
  })

  socket.on('screen-share-toggled', ({ userId, hasScreenshare }) => {
    const roomName = userRoomMapping.get(socket.id)
    if (!roomName) return
    const room = rooms.get(roomName)
    if (!room) return
    const user = room.users.get(socket.id)
    if (!user) return

    user.hasScreenshare = hasScreenshare

    // Broadcast to all users in the room (including the sender)
    io.to(roomName).emit('screen-share-toggled', { userId, hasScreenshare })
  })
  // This is called after the publisher gets AnnounceOk or
  // it starts transmitting data to the relay (this is not implemented yet)
  socket.on('update-track', (request: UpdateTrackRequest) => {
    console.debug('update-track', request, socket.id)
    const roomName = userRoomMapping.get(socket.id)

    if (!roomName) {
      const errorText = `Room not found in userRoomMapping.`
      console.warn(errorText, socket.id)
      socket.emit('error', newError('update-track', ErrorCode.RoomNotFound, errorText))
      return
    }

    const room = rooms.get(roomName)
    if (!room) {
      const errorText = `Room (${roomName}) not found.`
      console.warn(errorText, socket.id)
      socket.emit('error', newError('update-track', ErrorCode.RoomNotFound, errorText))
      return
    }

    const user = room.users.get(socket.id)
    if (!user) {
      const errorText = `User (${socket.id}) not found`
      console.warn(errorText)
      socket.emit('error', newError('update-track', ErrorCode.UserNotFound, errorText))
      return
    }

    const track = user.publishedTracks.get(request.trackType)!

    if (request.event === 'announce') {
      track.announced = Date.now()
    } else {
      track.published = Date.now()
    }

    const trackUpdate: TrackUpdateResponse = {
      userId: socket.id,
      track,
    }

    // notify other users
    console.debug('sending track-updated', trackUpdate, socket.id)
    socket.broadcast.to(roomName).emit('track-updated', trackUpdate)
  })

  socket.on('toggle-button', (request: ToggleRequest) => {
    console.debug('toggle-button', request, socket.id)
    const roomName = userRoomMapping.get(socket.id)

    if (!roomName) {
      const errorText = `Room (${roomName}) not found in userRoomMapping.`
      console.warn(errorText, socket.id)
      socket.emit('error', newError('toggle-button', ErrorCode.RoomNotFound, errorText))
      return
    }

    const room = rooms.get(roomName)
    if (!room) {
      const errorText = `Room (${roomName}) not found.`
      console.warn(errorText, socket.id)
      socket.emit('error', newError('toggle-button', ErrorCode.RoomNotFound, errorText))
      return
    }

    const user = room.users.get(socket.id)
    if (!user) {
      const errorText = `User (${socket.id}) not found`
      console.warn(errorText)
      socket.emit('error', newError('toggle-button', ErrorCode.UserNotFound, errorText))
      return
    }

    if (request.kind === 'cam') {
      user.hasVideo = request.value
    } else if (request.kind === 'mic') {
      user.hasAudio = request.value
    } else if (request.kind === 'screenshare') {
      user.hasScreenshare = request.value
    }

    const toggled: ToggleResponse = {
      userId: socket.id,
      kind: request.kind,
      value: request.value,
    }

    // notify other users
    console.debug('sending button-toggled', toggled, socket.id)
    socket.broadcast.to(roomName).emit('button-toggled', toggled)
  })

  socket.on('disconnect', (reason: DisconnectReason, description?: any) => {
    console.debug('disconnect', reason, socket.id)

    const roomName = userRoomMapping.get(socket.id)

    if (!roomName) {
      const errorText = `Room not found in userRoomMapping.`
      console.warn(errorText, socket.id)
      socket.emit('error', newError('update-track', ErrorCode.RoomNotFound, errorText))
      return
    }

    // remove from user room mapping
    userRoomMapping.delete(socket.id)

    // update my state
    const room = rooms.get(roomName)
    if (!room) {
      const errorText = `Room (${roomName}) not found.`
      console.warn(errorText, socket.id)
      socket.emit('error', newError('update-track', ErrorCode.RoomNotFound, errorText))
      return
    }

    room.users.delete(socket.id)
    console.debug(`User removed from room ${roomName}`, socket.id)

    if (room.users.size === 0) {
      const timer = roomTimers.get(roomName)
      if (timer) {
        clearTimeout(timer)
        roomTimers.delete(roomName)
      }
      rooms.delete(roomName)
      console.info(`Empty room ${roomName} cleaned up`)
    } else {
      const response: UserDisconnectedMessage = {
        userId: socket.id,
      }
      console.debug('user-disconnected', response, socket.id)
      socket.broadcast.to(roomName).emit('user-disconnect', response)
    }
  })
})

const PORT = process.env.MOQTAIL_WS_PORT || 3001
server.listen(PORT, () => {
  console.info(`MOQtail Room Server is running on port ${PORT}`)
})
