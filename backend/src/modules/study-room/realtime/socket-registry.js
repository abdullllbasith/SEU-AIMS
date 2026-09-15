const sockets = new Set();

export function registerStudyRoomSocket(socket) {
  sockets.add(socket);
  socket.once('disconnect', () => {
    sockets.delete(socket);
  });
}

export function disconnectStudyRoomSockets({ userId, sessionId } = {}) {
  if (!userId && !sessionId) {
    return 0;
  }
  let closed = 0;
  for (const socket of [...sockets]) {
    const principal = socket.principal;
    if (!principal) {
      continue;
    }
    const userMatch = userId && String(principal.userId) === String(userId);
    const sessionMatch = sessionId && String(principal.sessionId) === String(sessionId);
    if (userMatch || sessionMatch) {
      socket.disconnect(true);
      sockets.delete(socket);
      closed += 1;
    }
  }
  return closed;
}

export function countStudyRoomSockets() {
  return sockets.size;
}
