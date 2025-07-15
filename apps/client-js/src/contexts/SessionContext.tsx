import { createContext, useContext, useState, ReactNode } from 'react'
import { RoomState } from '../types/types'

type SessionContextType = {
  userId: string
  username: string
  roomState: RoomState | undefined
  setSession: (userId: string, username: string, roomState: RoomState) => void
  clearSession: () => void
}

const SessionContext = createContext<SessionContextType | undefined>(undefined)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState('')
  const [username, setUsername] = useState('')
  const [roomState, setRoomState] = useState<RoomState | undefined>(undefined)

  function setSession(userId: string, username: string, roomState: RoomState) {
    setUserId(userId)
    setUsername(username)
    setRoomState(roomState)
  }

  function clearSession() {
    setUserId('')
    setUsername('')
    setRoomState(undefined)
  }

  return (
    <SessionContext.Provider value={{ userId, username, roomState, setSession, clearSession }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within a SessionProvider')
  return ctx
}
