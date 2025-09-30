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

import { createContext, useContext, useState, ReactNode } from 'react'
import { RoomState } from '@/types/types'

type SessionContextType = {
  userId: string
  username: string
  roomState: RoomState | undefined
  sessionDurationMinutes: number
  setSession: (userId: string, username: string, roomState: RoomState, sessionDurationMinutes: number) => void
  clearSession: () => void
}

const SessionContext = createContext<SessionContextType | undefined>(undefined)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState('')
  const [username, setUsername] = useState('')
  const [roomState, setRoomState] = useState<RoomState | undefined>(undefined)
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(10) // default fallback

  function setSession(userId: string, username: string, roomState: RoomState, sessionDurationMinutes: number) {
    setUserId(userId)
    setUsername(username)
    setRoomState(roomState)
    setSessionDurationMinutes(sessionDurationMinutes)
  }

  function clearSession() {
    setUserId('')
    setUsername('')
    setRoomState(undefined)
    setSessionDurationMinutes(10)
  }

  return (
    <SessionContext.Provider value={{ userId, username, roomState, sessionDurationMinutes, setSession, clearSession }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
