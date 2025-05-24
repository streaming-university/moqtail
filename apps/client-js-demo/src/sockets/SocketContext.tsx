import React, { createContext, useContext, useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

const WS_URL = window.appSettings.wsUrl // e.g., "https://localhost"
const WS_PATH = window.appSettings.wsPath  // e.g., "/ws"

type SocketContextType = {
  socket: Socket | null;
  reconnect: () => void;
};
const SocketContext = createContext<SocketContextType>({
  socket: null,
  reconnect: () => {}
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  const createConnection = () => {
    const s = io(WS_URL, { path: WS_PATH });
    setSocket(s);
    return s;
  };

  const reconnect = () => {
    if (socket) {
      socket.disconnect();
    }
    createConnection();
  };

  useEffect(() => {
    const s = createConnection();
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, reconnect }}>
      {children}
    </SocketContext.Provider>
  );
};
