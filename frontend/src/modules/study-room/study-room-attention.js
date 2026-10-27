import { studyRoomApi } from './study-room-api.js';

const listeners = new Set();
let snapshot = { common: 0, private: 0, resources: 0, total: 0 };

export function resourcesSeenKey(userId) {
  return `seu-aims-study-room-resources-seen:${userId || 'me'}`;
}

export function readResourcesSeenAt(userId) {
  try {
    return window.localStorage.getItem(resourcesSeenKey(userId)) || '';
  } catch {
    return '';
  }
}

export function markResourcesSeen(userId) {
  const at = new Date().toISOString();
  try {
    window.localStorage.setItem(resourcesSeenKey(userId), at);
  } catch {
    // The badge still clears for this browser session.
  }
  snapshot = { ...snapshot, resources: 0, total: snapshot.common + snapshot.private };
  listeners.forEach((listener) => listener(snapshot));
  return at;
}

export function subscribeStudyRoomAttention(listener) {
  listeners.add(listener);
  listener(snapshot);
  return () => listeners.delete(listener);
}

export function notePrivateMessagesRead(count) {
  const drop = Math.max(0, Number(count) || 0);
  if (!drop) {
    return snapshot;
  }
  const privateCount = Math.max(0, snapshot.private - drop);
  snapshot = {
    ...snapshot,
    private: privateCount,
    total: snapshot.common + privateCount + snapshot.resources,
  };
  listeners.forEach((listener) => listener(snapshot));
  return snapshot;
}

export async function refreshStudyRoomAttention(userId) {
  const result = await studyRoomApi.attention(readResourcesSeenAt(userId));
  const data = result?.data || {};
  snapshot = {
    common: Number(data.common) || 0,
    private: Number(data.private) || 0,
    resources: Number(data.resources) || 0,
    total: Number(data.total) || 0,
  };
  listeners.forEach((listener) => listener(snapshot));
  return snapshot;
}
