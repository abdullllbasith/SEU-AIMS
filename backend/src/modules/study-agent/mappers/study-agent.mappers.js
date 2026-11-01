function id(value) {
  return value ? String(value) : null;
}

export function mapSession(session) {
  return {
    id: id(session._id),
    mode: session.mode,
    subjectOfferingId: id(session.subjectOfferingId),
    subjectCode: session.subjectCode || '',
    subjectName: session.subjectName || '',
    title: session.title,
    status: session.status,
    messageCount: session.messageCount || 0,
    lastActivityAt: session.lastActivityAt,
    createdAt: session.createdAt,
  };
}

export function mapSource(source) {
  return {
    kind: source.kind,
    title: source.title || '',
    fileId: id(source.fileId),
    page: source.page ?? null,
    section: source.section || null,
    url: source.url || null,
  };
}

export function mapMessage(message) {
  return {
    id: id(message._id),
    sessionId: id(message.sessionId),
    role: message.role,
    content: message.content,
    sources: (message.sources || []).map(mapSource),
    attachments: (message.attachments || []).map((item) => ({
      id: id(item.fileId),
      name: item.name || '',
      mimeType: item.mimeType || '',
    })),
    route: message.route?.mode
      ? { mode: message.route.mode, subjectCode: message.route.subjectCode || '', subjectName: message.route.subjectName || '' }
      : null,
    failed: Boolean(message.failed),
    createdAt: message.createdAt,
  };
}
