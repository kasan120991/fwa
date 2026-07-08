import { io, type Socket } from 'socket.io-client'

// App-wide singleton. SPA (ssr:false) so a module-scoped instance is safe —
// the socket survives route changes and is shared by every consumer.
let socket: Socket | null = null

/**
 * The shared Socket.IO connection to the API. Connects with credentials so the
 * httpOnly session cookie authenticates the handshake (same auth as the REST
 * API). Call from a component's setup; register listeners in onMounted and
 * clean them up in onBeforeUnmount.
 */
export function useSocket(): Socket {
  if (!socket) {
    const { public: { apiBase } } = useRuntimeConfig()
    // apiBase is e.g. "http://localhost:4000/api"; the socket attaches to the
    // server origin (default path /socket.io), so strip the trailing /api.
    const origin = apiBase.replace(/\/api\/?$/, '')
    socket = io(origin, { withCredentials: true })
  }
  return socket
}

/** Disconnect + drop the singleton (call on logout so the next login reconnects fresh). */
export function closeSocket() {
  socket?.disconnect()
  socket = null
}
