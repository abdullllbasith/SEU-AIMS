import { Server } from 'socket.io';

/**
 * Socket.IO transport only. Study Room authorization belongs in modules/study-room.
 * Redis adapter is attached when a connected Redis client is provided. Cross-instance
 * fan-out is not claimed as load-tested.
 */
export async function createRealtimeServer(httpServer, { corsOrigin, redis, logger } = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });

  io.adapterHint = 'in-process';
  io.redisSubClient = null;

  if (!redis) {
    return io;
  }

  try {
    const { createAdapter } = await import('@socket.io/redis-adapter');
    const subClient = redis.duplicate();
    if (typeof subClient.connect === 'function' && (subClient.status === 'wait' || subClient.status === 'end')) {
      await subClient.connect();
    }
    io.adapter(createAdapter(redis, subClient));
    io.adapterHint = 'redis';
    io.redisSubClient = subClient;
    logger?.info('Socket.IO Redis adapter attached');
  } catch (error) {
    logger?.warn('Socket.IO Redis adapter not attached; using in-process adapter', {
      message: error.message,
    });
  }

  return io;
}
