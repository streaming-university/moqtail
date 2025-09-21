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
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import Convert from 'ansi-to-html'

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Get real IP address considering proxy headers
function getRealIP(req: any): string {
  if (trustProxy) {
    // Check various proxy headers in order of preference
    const forwarded = req.headers['x-forwarded-for']
    if (forwarded) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      return forwarded.split(',')[0].trim()
    }

    const realIP = req.headers['x-real-ip']
    if (realIP) {
      return realIP
    }
  }

  // Fall back to connection remote address
  return req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown'
}

// Custom request handler function
function customRequestHandler(req: any, res: any) {
  const url = new URL(req.url!, `http://${req.headers.host}`)

  // Log request info (helpful for debugging proxy setup)
  if (behindProxy) {
    const realIP = getRealIP(req)
    console.debug(`Admin request from ${realIP}: ${req.method} ${url.pathname}`)
  }

  // Only handle our specific routes, let Socket.IO handle the rest
  const isOurRoute =
    (req.method === 'GET' && url.pathname === '/api/rooms') ||
    (req.method === 'POST' && url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/close')) ||
    (req.method === 'GET' && url.pathname === '/api/rooms/limits') ||
    (req.method === 'POST' && url.pathname === '/api/rooms/limits') ||
    (req.method === 'POST' && url.pathname === '/api/backend/restart-relay') ||
    (req.method === 'POST' && url.pathname === '/api/backend/restart-room-server') ||
    (req.method === 'POST' && url.pathname === '/api/backend/restart-all') ||
    (req.method === 'GET' && url.pathname === '/api/backend/service-status') ||
    (req.method === 'GET' && url.pathname === '/api/backend/logs') ||
    (req.method === 'GET' && url.pathname === '/admin') ||
    (req.method === 'OPTIONS' && (url.pathname.startsWith('/api/') || url.pathname === '/admin'))

  if (!isOurRoute) {
    return false // Let Socket.IO or other handlers process this request
  }

  // Set CORS headers only for our routes
  const origin = req.headers.origin || '*'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return true
  }

  if (req.method === 'GET' && url.pathname === '/api/rooms') {
    handleGetRooms(req, res)
    return true
  } else if (req.method === 'POST' && url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/close')) {
    const roomName = decodeURIComponent(url.pathname.split('/')[3])
    handleCloseRoom(req, res, roomName)
    return true
  } else if (req.method === 'GET' && url.pathname === '/api/rooms/limits') {
    handleGetRoomLimits(req, res)
    return true
  } else if (req.method === 'POST' && url.pathname === '/api/rooms/limits') {
    handleSetRoomLimits(req, res)
    return true
  } else if (req.method === 'POST' && url.pathname === '/api/backend/restart-relay') {
    handleRestartRelay(req, res)
    return true
  } else if (req.method === 'POST' && url.pathname === '/api/backend/restart-room-server') {
    handleRestartServer(req, res)
    return true
  } else if (req.method === 'POST' && url.pathname === '/api/backend/restart-all') {
    handleRestartBackend(req, res)
    return true
  } else if (req.method === 'GET' && url.pathname === '/api/backend/service-status') {
    handleServicesStatus(req, res)
    return true
  } else if (req.method === 'GET' && url.pathname === '/api/backend/logs') {
    handleLogs(req, res)
    return true
  } else if (req.method === 'GET' && url.pathname === '/admin') {
    handleAdminPage(req, res)
    return true
  }

  return false
}

let server
if (process.env.MOQTAIL_SECURE_WS) {
  // Adjust the paths as needed
  const certDir = '.'
  const options = {
    key: fs.readFileSync(path.join(certDir, 'key.pem')),
    cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
  }
  server = https.createServer(options, (req, res) => {
    if (!customRequestHandler(req, res)) {
      // If not handled by our custom handler, let it through (Socket.IO will handle it)
      res.writeHead(404)
      res.end('Not Found')
    }
  })
  console.info('Starting server in HTTPS mode')
} else {
  server = http.createServer((req, res) => {
    if (!customRequestHandler(req, res)) {
      // If not handled by our custom handler, let it through (Socket.IO will handle it)
      res.writeHead(404)
      res.end('Not Found')
    }
  })
  console.info('Starting server in HTTP mode')
}

// Proxy configuration
const behindProxy = process.env.MOQTAIL_BEHIND_PROXY === 'true'
const trustProxy = process.env.MOQTAIL_TRUST_PROXY === 'true'

// Room limits configuration
let roomLimits = {
  maxRooms: parseInt(process.env.MOQTAIL_MAX_ROOMS || '5'),
  maxUsersPerRoom: parseInt(process.env.MOQTAIL_MAX_USERS_PER_ROOM || '6'),
  sessionDurationMinutes: parseInt(process.env.MOQTAIL_SESSION_DURATION_MINUTES || '10'),
}

// ANSI to HTML converter for log formatting
const ansiConverter = new Convert({
  fg: '#FFF',
  bg: '#000',
  newline: true,
  escapeXML: true,
  stream: false,
})

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  path: '/ws',
  // Handle proxy configurations
  allowEIO3: true,
  transports: ['websocket', 'polling'],
})

function checkAdminAuth(req: any, res: any): boolean {
  // Check if admin password is set
  const adminPassword = process.env.MOQTAIL_ADMIN_PASSWORD
  if (!adminPassword) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Admin access disabled: MOQTAIL_ADMIN_PASSWORD environment variable not set' }))
    return false
  }

  // Check for Basic Authentication
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Basic realm="MOQtail Admin"',
    })
    res.end(JSON.stringify({ error: 'Authentication required' }))
    return false
  }

  // Decode and verify credentials
  try {
    const base64Credentials = authHeader.slice(6) // Remove 'Basic ' prefix
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii')
    const [username, password] = credentials.split(':')

    // Check password (username can be anything)
    if (password !== adminPassword) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Basic realm="MOQtail Admin"',
      })
      res.end(JSON.stringify({ error: 'Invalid credentials' }))
      return false
    }

    return true // Authentication successful
  } catch (error) {
    console.error('Authentication error:', error)
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Basic realm="MOQtail Admin"',
    })
    res.end(JSON.stringify({ error: 'Authentication failed' }))
    return false
  }
}

function handleGetRooms(req: any, res: any) {
  if (!checkAdminAuth(req, res)) return
  const roomsData = []

  for (const [roomName, room] of rooms.entries()) {
    const timer = roomTimers.get(roomName)
    const timeoutMs = roomLimits.sessionDurationMinutes * 60 * 1000
    const timeLeft = timer ? Math.max(0, timeoutMs - (Date.now() - room.created)) : 0

    const users = Array.from(room.users.values()).map((user) => ({
      id: user.id,
      name: user.name,
      joined: user.joined,
      hasVideo: user.hasVideo,
      hasAudio: user.hasAudio,
      hasScreenshare: user.hasScreenshare,
    }))

    roomsData.push({
      name: roomName,
      id: room.id,
      userCount: room.users.size,
      created: room.created,
      timeLeft: timeLeft,
      users: users,
    })
  }

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(roomsData))
}

function handleCloseRoom(req: any, res: any, roomName: string) {
  if (!checkAdminAuth(req, res)) return

  if (!rooms.has(roomName)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Room not found' }))
    return
  }

  closeRoom(roomName, 'admin')

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ success: true, message: `Room ${roomName} closed successfully by administrator` }))
}

function handleGetRoomLimits(req: any, res: any) {
  // Allow both admin and public access for GET
  if (req.headers.authorization && !checkAdminAuth(req, res)) return

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      success: true,
      limits: roomLimits,
    }),
  )
}

function handleSetRoomLimits(req: any, res: any) {
  if (!checkAdminAuth(req, res)) return

  let body = ''
  req.on('data', (chunk: any) => {
    body += chunk.toString()
  })

  req.on('end', () => {
    try {
      const newLimits = JSON.parse(body)

      // Validate the limits
      if (typeof newLimits.maxRooms !== 'number' || newLimits.maxRooms < 1 || newLimits.maxRooms > 100) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'maxRooms must be a number between 1 and 100' }))
        return
      }

      if (
        typeof newLimits.maxUsersPerRoom !== 'number' ||
        newLimits.maxUsersPerRoom < 1 ||
        newLimits.maxUsersPerRoom > 50
      ) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'maxUsersPerRoom must be a number between 1 and 50' }))
        return
      }

      if (
        typeof newLimits.sessionDurationMinutes !== 'number' ||
        newLimits.sessionDurationMinutes < 1 ||
        newLimits.sessionDurationMinutes > 1440
      ) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'sessionDurationMinutes must be a number between 1 and 1440 (24 hours)' }))
        return
      }

      // Update the limits
      roomLimits = {
        maxRooms: newLimits.maxRooms,
        maxUsersPerRoom: newLimits.maxUsersPerRoom,
        sessionDurationMinutes: newLimits.sessionDurationMinutes,
      }

      console.log('Room limits updated by admin:', roomLimits)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: true,
          message: 'Room limits updated successfully',
          limits: roomLimits,
        }),
      )
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON payload' }))
    }
  })
}

function handleRestartRelay(req: any, res: any) {
  if (!checkAdminAuth(req, res)) return

  console.log('Admin requested relay restart - closing all rooms first')

  // Close all rooms first to warn users
  for (const [roomName] of rooms) {
    closeRoom(roomName, 'admin')
  }

  // Give users a moment to see the warning
  setTimeout(() => {
    exec('pm2 restart relay', (error, stdout, stderr) => {
      if (error) {
        console.error('Error restarting relay:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'Failed to restart relay',
            details: error.message,
          }),
        )
        return
      }

      if (stderr) {
        console.warn('PM2 restart stderr:', stderr)
      }

      console.log('PM2 restart stdout:', stdout)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: true,
          message: 'All rooms closed and relay restarted successfully',
          output: stdout,
        }),
      )
    })
  }, 2000) // 2 second delay to allow users to see the warning
}

function handleRestartServer(req: any, res: any) {
  if (!checkAdminAuth(req, res)) return

  console.log('Admin requested server restart')

  // Send response immediately before restarting
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      success: true,
      message: 'Server restart initiated. The server will restart automatically.',
    }),
  )

  // Close all rooms first
  for (const [roomName] of rooms) {
    closeRoom(roomName, 'admin')
  }

  // Give a short delay to allow the response to be sent
  setTimeout(() => {
    console.log('Restarting server process...')
    process.exit(0) // PM2 will automatically restart the process
  }, 1000)
}

function handleRestartBackend(req: any, res: any) {
  if (!checkAdminAuth(req, res)) return

  console.log('Admin requested backend restart - closing all rooms first')

  // Close all rooms first to warn users
  for (const [roomName] of rooms) {
    closeRoom(roomName, 'admin')
  }

  // Give users a moment to see the warning, then restart relay first
  setTimeout(() => {
    exec('pm2 restart relay', (error, stdout, stderr) => {
      if (error) {
        console.error('Error restarting relay:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'Failed to restart relay',
            details: error.message,
          }),
        )
        return
      }

      console.log('Relay restarted, now restarting server...')

      // Send response before restarting server
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: true,
          message: 'All rooms closed, relay restarted, server restarting...',
        }),
      )

      // Restart server after a short delay
      setTimeout(() => {
        console.log('Restarting server process...')
        process.exit(0) // PM2 will automatically restart the process
      }, 1000)
    })
  }, 2000)
}

function handleServicesStatus(req: any, res: any) {
  if (!checkAdminAuth(req, res)) return

  exec('pm2 jlist', (error, stdout, stderr) => {
    if (error) {
      console.error('Error getting PM2 status:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'Failed to get service status',
          details: error.message,
        }),
      )
      return
    }

    try {
      const services = JSON.parse(stdout)
      const formattedServices = services.map((service: any) => ({
        id: service.pm_id,
        name: service.name,
        status: service.pm2_env.status,
        cpu: service.monit.cpu + '%',
        memory: formatMemory(service.monit.memory),
        uptime: formatUptime(service.pm2_env.pm_uptime),
        restarts: service.pm2_env.restart_time,
        pid: service.pid || 'N/A',
      }))

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, services: formattedServices }))
    } catch (parseError) {
      console.error('Error parsing PM2 output:', parseError)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'Failed to parse service status',
          details: parseError instanceof Error ? parseError.message : String(parseError),
        }),
      )
    }
  })
}

function formatMemory(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return Math.round(bytes / 1024) + 'kb'
  } else {
    return Math.round((bytes / (1024 * 1024)) * 10) / 10 + 'mb'
  }
}

function formatUptime(timestamp: number): string {
  const uptime = Date.now() - timestamp
  const minutes = Math.floor(uptime / (1000 * 60))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}d ${hours % 24}h`
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else {
    return `${minutes}m`
  }
}

function handleLogs(req: any, res: any) {
  if (!checkAdminAuth(req, res)) return

  const url = new URL(req.url!, `http://${req.headers.host}`)
  const service = url.searchParams.get('service') || 'relay'
  const lines = Math.min(Math.max(parseInt(url.searchParams.get('lines') || '100'), 10), 1000)

  // Validate service name to prevent command injection
  if (!['relay', 'ws'].includes(service)) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error: 'Invalid service name. Must be "relay" or "ws"',
      }),
    )
    return
  }

  const command = `pm2 logs --nostream --raw --lines ${lines} ${service}`

  exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
    if (error) {
      console.error('Error getting logs:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          error: 'Failed to get logs',
          details: error.message,
        }),
      )
      return
    }

    // If stderr contains warnings, include them but don't fail
    let logs = stdout
    if (stderr && stderr.trim()) {
      logs = `[PM2 Info]: ${stderr.trim()}\n\n${stdout}`
    }

    const rawLogs = logs || `No logs available for service: ${service}`
    const htmlLogs = ansiConverter.toHtml(rawLogs)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        success: true,
        service,
        lines,
        logs: rawLogs,
        htmlLogs: htmlLogs,
      }),
    )
  })
}

function checkAdminAuthHTML(req: any, res: any): boolean {
  // Check if admin password is set
  const adminPassword = process.env.MOQTAIL_ADMIN_PASSWORD
  if (!adminPassword) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Admin access disabled: MOQTAIL_ADMIN_PASSWORD environment variable not set')
    return false
  }

  // Check for Basic Authentication
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.writeHead(401, {
      'Content-Type': 'text/plain',
      'WWW-Authenticate': 'Basic realm="MOQtail Admin"',
    })
    res.end('Authentication required')
    return false
  }

  // Decode and verify credentials
  try {
    const base64Credentials = authHeader.slice(6) // Remove 'Basic ' prefix
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii')
    const [username, password] = credentials.split(':')

    // Check password (username can be anything)
    if (password !== adminPassword) {
      res.writeHead(401, {
        'Content-Type': 'text/plain',
        'WWW-Authenticate': 'Basic realm="MOQtail Admin"',
      })
      res.end('Invalid credentials')
      return false
    }

    return true // Authentication successful
  } catch (error) {
    console.error('Authentication error:', error)
    res.writeHead(401, {
      'Content-Type': 'text/plain',
      'WWW-Authenticate': 'Basic realm="MOQtail Admin"',
    })
    res.end('Authentication failed')
    return false
  }
}

function handleAdminPage(req: any, res: any) {
  if (!checkAdminAuthHTML(req, res)) return

  try {
    const adminHtmlPath = path.join(__dirname, '..', 'admin.html')
    const adminHtml = fs.readFileSync(adminHtmlPath, 'utf8')

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(adminHtml)
  } catch (error) {
    console.error('Failed to read admin.html:', error)
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Failed to load admin page')
  }
}

const rooms = new Map<string, RoomState>()
const userRoomMapping = new Map<string, string>()
const roomTimers = new Map<string, NodeJS.Timeout>()
let roomCounter = 0
let lastTrackAlias = 1

// Room management will now use configurable roomLimits instead of constants

function newRoom(roomName: string) {
  const room: RoomState = {
    id: roomCounter++,
    name: roomName,
    created: Date.now(),
    users: new Map(),
  }

  const timeoutMs = roomLimits.sessionDurationMinutes * 60 * 1000
  const timeoutId = setTimeout(() => {
    closeRoom(roomName, 'timeout')
  }, timeoutMs)

  roomTimers.set(roomName, timeoutId)
  console.info(`Room ${roomName} created with ${roomLimits.sessionDurationMinutes}-minute timeout`)

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

function closeRoom(roomName: string, reason: 'timeout' | 'admin' = 'timeout') {
  const reasonText = reason === 'timeout' ? 'due to timeout' : 'by administrator'
  console.info(`Closing room ${roomName} ${reasonText}`)

  const room = rooms.get(roomName)
  if (!room) {
    console.warn(`Room ${roomName} not found when trying to close`)
    return
  }

  // Send appropriate message based on closure reason
  if (reason === 'timeout') {
    io.to(roomName).emit('room-timeout', {
      message: `Room ${roomName} has timed out and will be closed.`,
    })
  } else {
    io.to(roomName).emit('room-closed', {
      message: `Room ${roomName} has been closed by an administrator.`,
      reason: 'admin',
    })
  }

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
  roomCounter--

  console.info(`Room ${roomName} successfully closed and cleaned up`)
}

io.on('connection', (socket) => {
  console.debug('new connection', socket.id)
  socket.on('time', () => {
    socket.emit('time', { serverTime: Date.now() })
  })
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
      if (rooms.size >= roomLimits.maxRooms) {
        const errorText = `Maximum room count (${roomLimits.maxRooms}) is reached. Room: ${roomName}`
        console.warn(errorText, socket.id)
        socket.emit('error', newError('join-room', ErrorCode.MaxRoomReached, errorText))
        return
      }
      room = newRoom(roomName)
      rooms.set(roomName, room)
    }

    if (room?.users.size >= roomLimits.maxUsersPerRoom) {
      const errorText = `Maximum user count (${roomLimits.maxUsersPerRoom}) in room is reached. Room:${roomName}`
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
  // This is called after the publisher gets PublishNamespaceOk or
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
      closeRoom(roomName, 'timeout')
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

  if (behindProxy) {
    console.info('🔗 Running behind proxy - make sure to configure proxy routes for:')
    console.info('   - /admin (admin interface)')
    console.info('   - /api/rooms* (room management API)')
    console.info('   - /ws/ (WebSocket connections - already configured)')
    if (trustProxy) {
      console.info('   - Proxy headers are trusted for real IP detection')
    }
  } else {
    console.info('🌐 Running standalone mode')
    console.info(`   - Admin interface: http://localhost:${PORT}/admin`)
    console.info(`   - API endpoint: http://localhost:${PORT}/api/rooms`)
  }
})
