import { Server } from 'socket.io';

/**
 * Socket.IO transport only. Study Room authorization and E2E payload rules
 * belong in modules/study-room, not here.
 */
export function createRealtimeServer(httpServer, { corsOrigin, redis } = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });

  if (redis) {
    io.adapterHint = 'redis-configured';
  } else {
    io.adapterHint = 'in-process';
  }

  return io;
}
