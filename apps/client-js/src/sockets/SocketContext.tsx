/**
 * Copyright 2025 The MOQtail Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const WS_URL = window.appSettings.wsUrl // e.g., "https://localhost"
const WS_PATH = window.appSettings.wsPath // e.g., "/ws"

type SocketContextType = {
  socket: Socket | null
  reconnect: () => void
}
const SocketContext = createContext<SocketContextType>({
  socket: null,
  reconnect: () => {},
})

export const useSocket = () => useContext(SocketContext)

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null)

  const createConnection = () => {
    const s = io(WS_URL, { path: WS_PATH })
    setSocket(s)
    return s
  }

  const reconnect = () => {
    if (socket) {
      socket.disconnect()
    }
    createConnection()
  }

  useEffect(() => {
    const s = createConnection()
    return () => {
      s.disconnect()
      setSocket(null)
    }
  }, [])

  return <SocketContext.Provider value={{ socket, reconnect }}>{children}</SocketContext.Provider>
}
