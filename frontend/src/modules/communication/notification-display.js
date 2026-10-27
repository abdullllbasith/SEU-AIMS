const LEGACY_STUDY_ROOM_TITLES = new Set(['New Study Room message', 'Study Room message']);

export function formatNotificationTitle(item) {
  const title = String(item?.title || '').trim();
  if (title && title !== item.type && !LEGACY_STUDY_ROOM_TITLES.has(title)) {
    return title;
  }
  if (item?.type === 'STUDY_ROOM_NEW_MESSAGE') {
    const path = notificationActionPath(item);
    if (path.includes('tab=private')) {
      return 'Private chat';
    }
    if (path.includes('tab=common')) {
      return 'Common batch chat';
    }
    return 'Study Room';
  }
  const raw = title || item?.type || '';
  if (/^[A-Z0-9_]+$/.test(raw)) {
    const cleaned = raw.toLowerCase().replaceAll('_', ' ');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return title || 'Notification';
}

export function notificationActionPath(item) {
  if (item?.actionPath) {
    return item.actionPath;
  }
  if (item?.type === 'STUDY_ROOM_NEW_MESSAGE') {
    return '/study-room?tab=common';
  }
  return '';
}

export function notificationBody(item) {
  if (item?.body) {
    return item.body;
  }
  if (item?.type === 'STUDY_ROOM_NEW_MESSAGE') {
    const path = notificationActionPath(item);
    if (path.includes('tab=private')) {
      return 'New message in a private conversation.';
    }
    return 'New message in your batch chat.';
  }
  return '';
}

export function notificationSourceMeta(item) {
  if (item?.sourceModule === 'study-room') {
    return 'Study Room';
  }
  if (item?.category === 'results') {
    return 'Results';
  }
  if (item?.category === 'notice') {
    return 'Notices';
  }
  if (item?.category === 'ca_recovery') {
    return 'CA recovery';
  }
  return 'Department update';
}

export function formatNotificationWhen(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
