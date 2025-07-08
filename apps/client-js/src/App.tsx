import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import JoinPage from './pages/JoinPage'
import SessionPage from './pages/SessionPage'
import { SessionProvider } from './contexts/SessionContext'
import { SocketProvider } from './sockets/SocketContext'

export default function App() {
  return (
    <SocketProvider>
      <SessionProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<JoinPage />} />
            <Route path="/session" element={<SessionPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </SocketProvider>
  )
}
