import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let currentAuthToken: string | null = null

export function getSocket(token: string): Socket {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://54.83.74.33:4000'
  const tokenWithBearer = token.startsWith('Bearer') ? token : `Bearer ${token}`
  
  // IMPORTANT: socket.io-client does not expose `socket.handshake.auth` on the client.
  // Using it causes false "token changed" detection and can create multiple sockets
  // (especially during Fast Refresh) -> races where offers arrive with no PC.
  if (socket) {
    if (currentAuthToken === tokenWithBearer) {
      // Reuse the same socket even if it's still connecting.
      return socket
    }

    // Token changed: disconnect the old socket and create a new one.
    try {
      socket.disconnect()
    } catch {
      // ignore
    }
    socket = null
    currentAuthToken = null
  }

  socket = io(`${apiUrl}/signaling`, {
    auth: {
      token: tokenWithBearer
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
  })
  currentAuthToken = tokenWithBearer

  socket.on('connect', () => {
    console.log('Admin socket connected, ID:', socket?.id)
  })

  socket.on('disconnect', (reason) => {
    console.log('Admin socket disconnected:', reason)
  })

  socket.on('connect_error', (error) => {
    console.error('Admin socket connection error:', error.message)
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
    currentAuthToken = null
  }
}

