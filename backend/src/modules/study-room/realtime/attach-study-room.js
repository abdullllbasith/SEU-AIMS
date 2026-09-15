import { authenticateSocket, resolveLivePrincipal } from './socket-auth.js';
import { registerStudyRoomSocket } from './socket-registry.js';
import { requireStudentScope } from '../services/access.service.js';
import {
  loadAuthorizedConversation,
  sendMessage,
  socketRoomName,
} from '../services/chat.service.js';
import { canAccessStudyRoom } from '../policies/study-room.policies.js';
import { assertRateLimit } from '../services/rate-limit.service.js';
import { TooManyRequestsError } from '../../../shared/errors/app-error.js';

async function requireLiveSocket(socket, ack) {
  try {
    socket.principal = await resolveLivePrincipal(socket.principal);
    if (!canAccessStudyRoom(socket.principal)) {
      throw new Error('Study Room is student-only');
    }
    await requireStudentScope(socket.principal);
    return true;
  } catch {
    if (typeof ack === 'function') {
      ack({ ok: false, error: 'Authentication required' });
    }
    socket.disconnect(true);
    return false;
  }
}

/**
 * Study Room socket handlers. Transport construction stays in infrastructure/realtime.
 */
export function attachStudyRoomRealtime(io, { config, logger }) {
  io.use(async (socket, next) => {
    try {
      socket.principal = await authenticateSocket(socket, { config });
      if (!canAccessStudyRoom(socket.principal)) {
        return next(new Error('Study Room is student-only'));
      }
      await requireStudentScope(socket.principal);
      return next();
    } catch (error) {
      logger?.warn('Study Room socket rejected', { message: error.message });
      return next(new Error('Authentication required'));
    }
  });

  io.on('connection', (socket) => {
    registerStudyRoomSocket(socket);

    socket.on('study-room:join', async (payload, ack) => {
      if (!(await requireLiveSocket(socket, ack))) {
        return;
      }
      try {
        const { context } = await requireStudentScope(socket.principal);
        const conversation = await loadAuthorizedConversation(
          socket.principal,
          payload?.conversationId,
          context,
        );
        socket.join(socketRoomName(conversation._id));
        if (typeof ack === 'function') {
          ack({ ok: true, conversationId: String(conversation._id) });
        }
      } catch {
        if (typeof ack === 'function') {
          ack({ ok: false, error: 'Forbidden' });
        }
      }
    });

    socket.on('study-room:leave', async (payload, ack) => {
      if (!(await requireLiveSocket(socket, ack))) {
        return;
      }
      if (payload?.conversationId) {
        socket.leave(socketRoomName(payload.conversationId));
      }
    });

    socket.on('study-room:message', async (payload, ack) => {
      if (!(await requireLiveSocket(socket, ack))) {
        return;
      }
      try {
        const result = await sendMessage(socket.principal, payload?.conversationId, payload || {}, { config });
        io.to(socketRoomName(payload.conversationId)).emit('study-room:message:new', result.message);
        if (typeof ack === 'function') {
          ack({ ok: true, ...result });
        }
      } catch (error) {
        logger?.info('Study Room socket message rejected', { code: error.code });
        if (typeof ack === 'function') {
          ack({ ok: false, error: error.message || 'Rejected' });
        }
      }
    });

    socket.on('study-room:typing', async (payload) => {
      if (!(await requireLiveSocket(socket))) {
        return;
      }
      try {
        assertRateLimit(
          `sr:typing:${socket.principal.userId}`,
          { max: config.studyRoom?.typingMaxPerMinute || 30, windowMs: 60_000 },
          TooManyRequestsError,
        );
        const { context } = await requireStudentScope(socket.principal);
        const conversation = await loadAuthorizedConversation(
          socket.principal,
          payload?.conversationId,
          context,
        );
        socket.to(socketRoomName(conversation._id)).emit('study-room:typing', {
          conversationId: String(conversation._id),
          userId: socket.principal.userId,
        });
      } catch {
        // Typing is ephemeral; failures are silent.
      }
    });
  });
}
