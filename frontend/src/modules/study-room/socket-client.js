import { io } from 'socket.io-client';

export function connectStudyRoomSocket() {
  const url = import.meta.env.VITE_API_ORIGIN || window.location.origin;
  return io(url, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    path: '/socket.io',
  });
}
