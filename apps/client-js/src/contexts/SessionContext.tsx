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
