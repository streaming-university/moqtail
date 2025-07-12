import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { JoinResponse, ErrorResponse } from '../types/types'
import { useSession } from '../contexts/SessionContext'
import { useSocket } from '../sockets/SocketContext'

export default function JoinPage() {
  const [username, setUsername] = useState('')
  const [roomName, setRoomName] = useState('')
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const navigate = useNavigate()
  const { setSession } = useSession()
  const { socket: contextSocket, reconnect } = useSocket()

  useEffect(() => {
    if (!contextSocket || !contextSocket.connected) {
      console.log('WebSocket not connected on page load, reconnecting...')
      reconnect()
    }
  }, [])

  useEffect(() => {
    if (!contextSocket) return

    const socket = contextSocket

    socket.on('joined-room', (response: JoinResponse) => {
      setSession(response.userId, username, response.roomState)
      console.log('Navigating to /session', response.roomState)
      navigate('/session')
    })

    socket.on('error', (errorResponse: ErrorResponse) => {
      setError(errorResponse.text || 'Failed to join room')
      setConnecting(false)
    })

    // Cleanup listeners only (do NOT disconnect the socket here!)
    return () => {
      socket.off('joined-room')
      socket.off('error')
    }
    // eslint-disable-next-line
  }, [contextSocket, username, setSession, navigate])
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const trimmedUsername = username.trim()
    const trimmedRoomName = roomName.trim()

    if (trimmedUsername.length > 30 || trimmedUsername.length === 0) {
      setError('Username must be between 1-30 characters')
      return
    }

    if (trimmedRoomName.length > 20 || trimmedRoomName.length === 0) {
      setError('Room name must be between 1-20 characters')
      return
    }

    if (!contextSocket || !contextSocket.connected) {
      setError('Socket not connected. Please wait a moment and try again.')
      return
    }

    setConnecting(true)
    contextSocket.emit('join-room', { username: trimmedUsername, roomName: trimmedRoomName })
  }

  return (
    <div className="join-container">
      <div className="join-logo">
        <img src="/moqtail.svg" alt="MoqTail Logo" width="100%" height="100%" />
      </div>
      <div className="join-content">
        <nav className="join-nav"></nav>
        <h1>
          <b>MOQtail Demo</b>
        </h1>
        <h2>Join a Room</h2>
        <div className="browser-compatibility">
          Please use a recent version of Chrome that supports WebCodecs and WebTransport APIs. Report any issues on{' '}
          <a
            href="https://github.com/streaming-university/moqtail"
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
          >
            GitHub
          </a>
          .
        </div>
        <form onSubmit={handleSubmit} className="join-form">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your Name"
            required
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            data-form-type="other"
            data-lpignore="true"
            role="textbox"
            inputMode="text"
            className="join-input"
            disabled={connecting}
            maxLength={30}
          />
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="Room Name"
            required
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            data-form-type="other"
            data-lpignore="true"
            role="textbox"
            inputMode="text"
            className="join-input"
            disabled={connecting}
            maxLength={20}
          />
          <button className="join-button" disabled={connecting}>
            {connecting ? 'Connecting...' : 'Join'}
          </button>
        </form>
        <div className="privacy-notice">
          * We collect anonymous usage statistics and logs to improve the platform.
          <br />* Session duration in each room is limited to 10 minutes and session size is limited to six
          participants.
        </div>
        {error && <div className="error-message">{error}</div>}
      </div>

      <style>{`
      .join-container {
        max-height: 100dvh;
        height: 100dvh;
        width: 100vw;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        padding: 2.5rem 4rem;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        text-align: center;
        gap: 6rem;
      }
      .join-logo {
        flex-shrink: 1;
        min-height: 200px;
        // padding-top: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .join-logo img {
        max-height: 100%;
        width: 100%;
        display: block;
        object-fit: contain;
        max-height: 500px;
      }
      .join-content {
        max-width: 360px;
        display: flex;
        flex-grow: 1;
        flex-direction: column;
        align-items: center;
        width: 100%;
      }
      .join-nav {
        display: flex;
        gap: 1.8rem;
        margin-bottom: 0rem;
        font-size: 1.08rem;
        font-weight: 500;
      }
      .join-link {
        color: #577B9F;
        text-decoration: none;
        transition: color .2s;
      }
      .join-link:hover {
        color: #34495e;
        text-decoration: underline;
      }
      h1 {
        font-size: 3rem;
        margin-bottom: 0.2rem;
        color: #2c3e50;
        font-family: 'MoqBold', 'Segoe UI', sans-serif;
      }
      h2 {
        font-family: 'MoqSemiBold', 'Segoe UI', sans-serif;
        font-weight: 400;
        margin-bottom: 2rem;
        color: #34495e;
        margin-top: 0;
      }
      .join-form {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
      }
      .join-input {
        padding: 0.8rem 1rem;
        font-size: 1.1rem;
        border: 1.8px solid #ddd;
        border-radius: 6px;
        background-color: transparent;
        transition: border-color 0.3s, box-shadow 0.3s;
        outline-offset: 2px;
      }
      .join-input:focus {
        border-color: #D74401;
        box-shadow: 0 0 8px rgb(52, 74, 96);
      }
      .join-button {
        padding: 0.9rem 1rem;
        font-size: 1.15rem;
        font-weight: 600;
        background-color: #577B9F;
        border: none;
        border-radius: 6px;
        color: white;
        cursor: pointer;
        transition: background-color 0.25s;
      }
      .join-button:hover {
        background-color: #D74401;
      }
      .error-message {
        color: #e74c3c;
        margin-top: 1rem;
        font-weight: 600;
      }
      .privacy-notice {
        font-size: 0.75rem;
        color: #7f8c8d;
        margin-top: 0.8rem;
        margin-bottom: 0.5rem;
        opacity: 0.8;
      }
      .browser-compatibility {
        font-size: 0.726rem;
        color: #577B9F;
        margin-bottom: 1.5rem;
        padding: 0.8rem 1rem;
        background-color: #ecf0f1;
        border-radius: 6px;
        line-height: 1.4;
      }
      .github-link {
        color: #577B9F;
        text-decoration: underline;
        font-weight: 600;
        transition: color 0.2s;
      }
      .github-link:hover {
        color: #D74401;
      }
      @media (max-width: 600px) {
        .join-logo {
          max-height: 250px;
          min-height: 100px;
          width: 100%;
          margin-top: -10px;
        }
        .join-logo img {
          max-height: 100%;
          max-width: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
       }
        .join-content {
          max-width: 100%;     
          max-height: 500px;       
          padding: 1px;
          overflow: hidden;         
       }
        .browser-compatibility {
          font-size: 0.726rem;
          color: #577B9F;
          margin-bottom: 0.5rem;
          padding: 0.8rem 0.2rem;
          background-color: #ecf0f1;
          border-radius: 3px;
          line-height: 1.4;
        }
        h1 {
          font-size: 2rem;
          margin-bottom: 0.0rem;
          color: #2c3e50;
          font-family: 'MoqBold', 'Segoe UI', sans-serif;
        }
        h2 {
          font-family: 'MoqSemiBold', 'Segoe UI', sans-serif;
          font-weight: 400;
          margin-bottom: 0.1rem;
          color: #34495e;
          margin-top: 0;
        }
        .join-form {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .join-input {
          padding: 0.3rem 1rem;
          font-size: 1.0rem;
          border: 1.8px solid #ddd;
          border-radius: 6px;
          background-color: transparent;
          transition: border-color 0.3s, box-shadow 0.3s;
          outline-offset: 2px;
        }
        .join-container {
          flex-direction: column;
          gap: 0rem;
          padding: 1rem;
        }
        .join-content {
          max-width: 100%;     
          max-height: 60rem;       
          padding: 1px;
          overflow: hidden;  
        }
        .join-button {
          padding: 0.5rem 0.8rem;
          font-size: 0.9rem;
          font-weight: 600;
          background-color: #577B9F;
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          transition: background-color 0.25s;
        }
      }
      `}</style>
    </div>
  )
}
