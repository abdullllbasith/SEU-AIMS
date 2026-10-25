import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { studyRoomApi } from './study-room-api.js';
import { connectStudyRoomSocket } from './socket-client.js';
import { loadOrCreateIdentity, loadRoomKeyMaterial, rememberRoomKeyMaterial } from './key-store.js';
import {
  decryptPayload,
  derivePrivateConversationKey,
  encryptPlaintext,
  exportPrivateJwk,
  exportPublicJwk,
  exportRawKey,
  generateGroupKey,
  generateIdentityKeyPair,
  importPrivateJwk,
  importPublicJwk,
  importRawAesKey,
  unwrapGroupKey,
  wrapGroupKey,
} from './encryption.js';
import { useAuth } from '../../state/AuthProvider.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

function clientMessageId() {
  return crypto.randomUUID ? crypto.randomUUID() : `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function placeMessage(current, message) {
  const index = current.findIndex(
    (item) =>
      (message.id && item.id === message.id) ||
      (message.clientMessageId && item.clientMessageId === message.clientMessageId),
  );
  if (index === -1) {
    return [...current, message];
  }
  const next = current.slice();
  next[index] = {
    ...current[index],
    ...message,
    plain: message.plain || current[index].plain || '',
    senderDisplayName: message.senderDisplayName || current[index].senderDisplayName,
    localStatus: message.localStatus || current[index].localStatus || 'acknowledged',
  };
  return next;
}

async function unwrapEnvelope(envelope, identity, me) {
  const wrappedBy = String(envelope.wrappedByUserId || '');
  let wrapperPublic = identity.publicKey;
  if (wrappedBy && wrappedBy !== String(me)) {
    const wrapper = await studyRoomApi.getPublicKey(wrappedBy);
    if (!wrapper.data?.publicKeyJwk) {
      throw new Error('Chat key wrapper is not available on this device');
    }
    wrapperPublic = await importPublicJwk(wrapper.data.publicKeyJwk);
  }
  return unwrapGroupKey(envelope, identity.privateKey, wrapperPublic);
}

async function collectKeys(envelopes, identity, me) {
  const keys = [];
  for (const envelope of envelopes) {
    if (!envelope?.wrappedKey || !envelope?.nonce) {
      continue;
    }
    try {
      keys.push(await unwrapEnvelope(envelope, identity, me));
    } catch {
      // This wrap belongs to another device key.
    }
    for (const previous of envelope.previousWraps || []) {
      try {
        keys.push(await unwrapEnvelope(previous, identity, me));
      } catch {
        // Older wrap is not for this device.
      }
    }
  }
  return keys;
}

async function syncCanonicalKey(conversationId, conversation, aesKey, identity, me) {
  const recipients = (conversation.batchMemberUserIds || [])
    .map((item) => String(item))
    .filter((item) => item && item !== String(me))
    .slice(0, 200);
  if (!recipients.length) {
    return;
  }
  const raw = await exportRawKey(aesKey);
  const envelopes = [];
  for (const recipientUserId of recipients) {
    try {
      const keyResponse = await studyRoomApi.getPublicKey(recipientUserId);
      if (!keyResponse.data?.publicKeyJwk) {
        continue;
      }
      const recipientPublic = await importPublicJwk(keyResponse.data.publicKeyJwk);
      const wrapped = await wrapGroupKey(raw, identity.privateKey, recipientPublic);
      envelopes.push({ recipientUserId, ...wrapped });
    } catch {
      // Classmate has not published a key yet.
    }
  }
  if (!envelopes.length) {
    return;
  }
  await studyRoomApi.putEnvelopes(conversationId, {
    keyVersion: conversation.currentKeyVersion,
    sync: true,
    envelopes,
  });
}

async function importRememberedKeys(conversationId) {
  const rawKeys = await loadRoomKeyMaterial(conversationId);
  const keys = [];
  for (const raw of rawKeys) {
    try {
      keys.push(await importRawAesKey(raw));
    } catch {
      // Skip a stored key this browser can no longer import.
    }
  }
  return keys;
}

async function persistKeys(conversationId, keys) {
  const rawKeys = [];
  for (const key of keys) {
    try {
      rawKeys.push(new Uint8Array(await exportRawKey(key)));
    } catch {
      // Private-chat keys are derived again on the next visit.
    }
  }
  await rememberRoomKeyMaterial(conversationId, rawKeys);
}

async function openPlaintext(keys, payload) {
  for (const key of keys) {
    try {
      return await decryptPayload(key, payload);
    } catch {
      // Try the next key this browser holds.
    }
  }
  return '';
}

async function resolveStudyRoomKey(id, identity, me) {
  const remembered = await importRememberedKeys(id);
  const detail = await studyRoomApi.getConversation(id);
  const conversation = detail.data.conversation;
  if (conversation.type === 'PRIVATE') {
    const resolvedPeer = (conversation.participantUserIds || []).find((item) => String(item) !== String(me));
    const keyResponse = await studyRoomApi.getPublicKey(resolvedPeer);
    if (!keyResponse.data?.publicKeyJwk) {
      throw new Error('The other student has not published a public key yet');
    }
    const peerPublic = await importPublicJwk(keyResponse.data.publicKeyJwk);
    const participantKey = [...conversation.participantUserIds].sort().join(':');
    const encryptKey = await derivePrivateConversationKey(
      identity.privateKey,
      peerPublic,
      conversation.id,
      participantKey,
    );
    return { encryptKey, decryptKeys: [encryptKey], conversation };
  }

  const decryptKeys = [...remembered];
  let encryptKey = null;
  if (detail.data.myEnvelope) {
    try {
      encryptKey = await unwrapEnvelope(detail.data.myEnvelope, identity, me);
      decryptKeys.push(encryptKey);
    } catch {
      encryptKey = null;
    }
    for (const previous of detail.data.myEnvelope.previousWraps || []) {
      try {
        decryptKeys.push(await unwrapEnvelope(previous, identity, me));
      } catch {
        // An older wrap is for a different device key.
      }
    }
  }
  if (!encryptKey) {
    encryptKey = decryptKeys[0] || (await generateGroupKey());
    decryptKeys.unshift(encryptKey);
    try {
      const raw = await exportRawKey(encryptKey);
      const selfWrap = await wrapGroupKey(raw, identity.privateKey, identity.publicKey);
      await studyRoomApi.putEnvelopes(id, {
        keyVersion: conversation.currentKeyVersion,
        envelopes: [{ recipientUserId: me, ...selfWrap }],
      });
    } catch {
      // Sending still works with the key saved on this device.
    }
  }
  await persistKeys(id, decryptKeys);
  return { encryptKey, decryptKeys, conversation, detail };
}

async function republishOwnMessages(conversationId, me, items, keyBundle) {
  if (!keyBundle?.encryptKey) {
    return;
  }
  for (const message of items) {
    if (String(message.senderUserId) !== String(me) || message.deletedAt || !message.id) {
      continue;
    }
    try {
      await decryptPayload(keyBundle.encryptKey, message.encryptedPayload);
      continue;
    } catch {
      // Stored with an older batch key.
    }
    let plain = '';
    for (const key of keyBundle.decryptKeys || []) {
      try {
        plain = await decryptPayload(key, message.encryptedPayload);
        break;
      } catch {
        plain = '';
      }
    }
    if (!plain) {
      continue;
    }
    const encryptedPayload = await encryptPlaintext(keyBundle.encryptKey, plain);
    await studyRoomApi.editMessage(conversationId, message.id, { encryptedPayload });
  }
}

function sortInbox(items) {
  return [...items].sort(
    (left, right) => new Date(right.lastMessageAt || 0).getTime() - new Date(left.lastMessageAt || 0).getTime(),
  );
}

function inboxTime(value) {
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
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMessageTime(value) {
  if (!value) {
    return '';
  }
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function messageAtOrBefore(message, anchor) {
  if (!message || !anchor) {
    return false;
  }
  const sentAt = new Date(message.sentAt || message.createdAt).getTime();
  const anchorAt = new Date(anchor.sentAt || anchor.createdAt).getTime();
  if (sentAt < anchorAt) {
    return true;
  }
  if (sentAt > anchorAt) {
    return false;
  }
  return String(message.id) <= String(anchor.id);
}

function applyPeerRead(messages, lastReadMessageId, me) {
  const anchor = messages.find((item) => item.id === lastReadMessageId);
  if (!anchor) {
    return messages;
  }
  return messages.map((item) => {
    if (String(item.senderUserId) !== String(me)) {
      return item;
    }
    return messageAtOrBefore(item, anchor) ? { ...item, readByPeer: true } : item;
  });
}

function deliveryTickStatus(item) {
  if (item.localStatus === 'failed') {
    return 'failed';
  }
  if (item.localStatus === 'pending') {
    return 'pending';
  }
  return item.readByPeer ? 'read' : 'delivered';
}

function MessageTicks({ status }) {
  if (status === 'failed') {
    return null;
  }
  if (status === 'pending') {
    return (
      <span className="message-ticks message-ticks--pending" aria-hidden="true">
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
          <path
            fill="currentColor"
            d="M6 1a5 5 0 100 10 5 5 0 000-10zm0 1.5a3.5 3.5 0 110 7 3.5 3.5 0 010-7z"
          />
        </svg>
      </span>
    );
  }
  const read = status === 'read';
  return (
    <span
      className={read ? 'message-ticks message-ticks--read' : 'message-ticks message-ticks--delivered'}
      aria-label={read ? 'Read' : 'Delivered'}
    >
      <svg viewBox="0 0 16 15" width="16" height="14" aria-hidden="true">
        <path
          fill="currentColor"
          d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.063-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"
        />
      </svg>
    </span>
  );
}

function ChatBubbleBody({
  isMine,
  showSender,
  senderName,
  onSenderClick,
  text,
  deleted,
  timeLabel,
  tickStatus,
}) {
  if (deleted) {
    return <p className="study-room__message-text is-removed">[removed]</p>;
  }
  return (
    <>
      {!isMine && showSender && senderName ? (
        onSenderClick ? (
          <button type="button" className="study-room__message-sender" onClick={onSenderClick}>
            {senderName}
          </button>
        ) : (
          <span className="study-room__message-sender">{senderName}</span>
        )
      ) : null}
      <span className="study-room__message-line">
        <span className="study-room__message-text">{text}</span>
        <span className="study-room__message-footer">
          {timeLabel ? <time className="study-room__message-time">{timeLabel}</time> : null}
          {isMine ? <MessageTicks status={tickStatus} /> : null}
        </span>
      </span>
    </>
  );
}

function connectionTone(socketState) {
  if (socketState === 'connected') {
    return 'status-pill status-pill--ok';
  }
  if (socketState === 'unauthorized') {
    return 'status-pill status-pill--danger';
  }
  return 'status-pill status-pill--pending';
}

function resourceStatusClass(label) {
  const value = String(label || '').toUpperCase();
  if (value.includes('AVAILABLE') || value.includes('APPROVED') || value.includes('SAFE')) {
    return 'status-pill status-pill--ok';
  }
  if (value.includes('PENDING') || value.includes('SCAN') || value.includes('REVIEW')) {
    return 'status-pill status-pill--pending';
  }
  if (value.includes('REJECT') || value.includes('UNSAFE') || value.includes('FAIL')) {
    return 'status-pill status-pill--danger';
  }
  return 'status-pill';
}

export function StudyRoomPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('loading');
  const [overview, setOverview] = useState(null);
  const [tab, setTab] = useState('common');
  const [identity, setIdentity] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sendState, setSendState] = useState('idle');
  const [socketState, setSocketState] = useState('disconnected');
  const [folders, setFolders] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [activeFolder, setActiveFolder] = useState(null);
  const [resources, setResources] = useState([]);
  const [peers, setPeers] = useState([]);
  const [query, setQuery] = useState('');
  const [privateId, setPrivateId] = useState(null);
  const [pending, setPending] = useState([]);
  const [threadReady, setThreadReady] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [inbox, setInbox] = useState([]);
  const keyCacheRef = useRef(new Map());
  const conversationIdRef = useRef(null);
  const socketRef = useRef(null);

  const conversationId = tab === 'private' ? privateId : overview?.commonConversation?.id;
  const meId = String(user?.id || user?.userId || '');
  conversationIdRef.current = conversationId;

  const prepareIdentity = useCallback(async () => {
    const next = await loadOrCreateIdentity(
      generateIdentityKeyPair,
      exportPrivateJwk,
      importPrivateJwk,
      exportPublicJwk,
    );
    setIdentity(next);
    await studyRoomApi.putPublicKey({ publicKeyJwk: next.publicJwk, keyVersion: next.keyVersion || '1' });
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const access = await studyRoomApi.access();
        if (cancelled) {
          return;
        }
        if (!access.data.allowed) {
          setOverview(access.data);
          setStatus('unavailable');
          return;
        }
        setOverview(access.data);
        await prepareIdentity();
        const folderResult = await studyRoomApi.folders();
        setFolders(folderResult.data.items);
        setStatus('ready');
      } catch (caught) {
        if (!cancelled) {
          setError(caught.message || 'Unable to open Study Room');
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prepareIdentity]);

  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    const tabParam = searchParams.get('tab');
    const conversationParam = searchParams.get('conversation');
    if (!tabParam && !conversationParam) {
      return;
    }
    if (tabParam === 'private' && conversationParam) {
      setTab('private');
      setPrivateId(conversationParam);
    } else if (tabParam === 'common') {
      setTab('common');
    }
    setSearchParams({}, { replace: true });
  }, [status, searchParams, setSearchParams]);

  const resolveConversationKey = useCallback(
    async (id, currentIdentity, { refresh = false } = {}) => {
      const me = String(user.id || user.userId || '');
      if (refresh) {
        for (const key of [...keyCacheRef.current.keys()]) {
          if (String(key).startsWith(`${id}:`)) {
            keyCacheRef.current.delete(key);
          }
        }
      }
      const cacheKey = `${id}:${currentIdentity?.keyVersion || '1'}:${refresh ? 'refresh' : 'stable'}`;
      if (!refresh && keyCacheRef.current.has(`${id}:stable`)) {
        return keyCacheRef.current.get(`${id}:stable`);
      }
      const promise = (async () => resolveStudyRoomKey(id, currentIdentity, me))().catch((err) => {
        keyCacheRef.current.delete(`${id}:stable`);
        keyCacheRef.current.delete(cacheKey);
        throw err;
      });
      keyCacheRef.current.set(`${id}:stable`, promise);
      return promise;
    },
    [user],
  );

  const refreshInbox = useCallback(async () => {
    const result = await studyRoomApi.conversations();
    const items = sortInbox((result.data.items || []).filter((item) => item.type === 'PRIVATE'));
    setInbox(items);
    return items;
  }, []);

  const fillPreviews = useCallback(
    async (items) => {
      if (!identity) {
        return;
      }
      const previews = await Promise.all(
        items.map(async (item) => {
          if (!item.lastMessage?.encryptedPayload) {
            return '';
          }
          try {
            const bundle = await resolveConversationKey(item.id, identity);
            const keys = bundle.decryptKeys?.length ? bundle.decryptKeys : [bundle.encryptKey].filter(Boolean);
            return await openPlaintext(keys, item.lastMessage.encryptedPayload);
          } catch {
            return '';
          }
        }),
      );
      setInbox((current) =>
        sortInbox(
          current.map((item) => {
            const index = items.findIndex((candidate) => candidate.id === item.id);
            if (index < 0) {
              return item;
            }
            const preview = previews[index];
            return { ...item, preview: preview || (item.lastMessage ? 'New message' : item.preview || '') };
          }),
        ),
      );
    },
    [identity, resolveConversationKey],
  );

  useEffect(() => {
    if (status !== 'ready' || !identity) {
      return undefined;
    }
    const socket = connectStudyRoomSocket();
    socketRef.current = socket;
    socket.on('connect', () => {
      setSocketState('connected');
      const openId = conversationIdRef.current;
      if (openId) {
        socket.emit('study-room:join', { conversationId: openId }, () => {});
      }
    });
    socket.on('disconnect', () => setSocketState('disconnected'));
    socket.on('connect_error', () => setSocketState('unauthorized'));
    socket.on('study-room:message:new', (message) => {
      if (String(message.conversationId) !== String(conversationIdRef.current)) {
        return;
      }
      resolveConversationKey(message.conversationId, identity)
        .then(async (bundle) => {
          const plain = message.deletedAt
            ? ''
            : await openPlaintext(bundle.decryptKeys, message.encryptedPayload);
          setMessages((current) =>
            placeMessage(current, {
              ...message,
              plain,
              localStatus: 'acknowledged',
              readByPeer: message.readByPeer === true,
            }),
          );
          if (String(message.senderUserId) !== meId && message.id) {
            studyRoomApi.markRead(message.conversationId, message.id).catch(() => {});
          }
        })
        .catch(() => {});
    });
    socket.on('study-room:read', (payload) => {
      if (String(payload?.conversationId) !== String(conversationIdRef.current)) {
        return;
      }
      if (String(payload.userId) === meId || !payload.lastReadMessageId) {
        return;
      }
      setMessages((current) => applyPeerRead(current, payload.lastReadMessageId, meId));
    });
    socket.on('study-room:inbox', (payload) => {
      const conversationIdFromEvent = payload?.conversationId;
      if (!conversationIdFromEvent) {
        return;
      }
      setInbox((current) => {
        const existing = current.find((item) => item.id === conversationIdFromEvent);
        if (!existing) {
          refreshInbox()
            .then((items) => fillPreviews(items))
            .catch(() => {});
          return current;
        }
        const updated = {
          ...existing,
          lastMessageAt: payload.lastMessageAt || existing.lastMessageAt,
          lastMessage: payload.message
            ? {
                id: payload.message.id,
                senderUserId: payload.message.senderUserId,
                encryptedPayload: payload.message.encryptedPayload,
                sentAt: payload.message.sentAt,
              }
            : existing.lastMessage,
          preview: String(payload.message?.senderUserId) === meId ? existing.preview : 'New message',
        };
        return sortInbox([updated, ...current.filter((item) => item.id !== conversationIdFromEvent)]);
      });
      if (payload?.message?.encryptedPayload) {
        fillPreviews([
          {
            id: conversationIdFromEvent,
            lastMessage: { encryptedPayload: payload.message.encryptedPayload },
          },
        ]).catch(() => {});
      }
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [status, identity, resolveConversationKey, refreshInbox, fillPreviews, meId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !conversationId) {
      return undefined;
    }
    socket.emit('study-room:join', { conversationId }, () => {});
    return () => {
      socket.emit('study-room:leave', { conversationId });
    };
  }, [conversationId, socketState]);

  useEffect(() => {
    if (status !== 'ready' || tab !== 'private') {
      return undefined;
    }
    let cancelled = false;
    refreshInbox()
      .then((items) => {
        if (!cancelled) {
          return fillPreviews(items);
        }
        return undefined;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, tab, refreshInbox, fillPreviews]);

  useEffect(() => {
    if (status !== 'ready' || !conversationId || !identity) {
      return undefined;
    }
    let cancelled = false;
    setThreadReady(false);
    setMessages([]);
    (async () => {
      const keyBundle = await resolveConversationKey(conversationId, identity);
      const history = await studyRoomApi.messages(conversationId);
      const items = [];
      for (const item of history.data.items) {
        const plain = item.deletedAt ? '' : await openPlaintext(keyBundle.decryptKeys, item.encryptedPayload);
        items.push({
          ...item,
          plain,
          localStatus: 'acknowledged',
          readByPeer: item.readByPeer === true,
        });
      }
      if (cancelled) {
        return;
      }
      setMessages(items);
      setThreadReady(true);
      const latest = items.filter((row) => row.id && !row.deletedAt).at(-1);
      if (latest?.id) {
        studyRoomApi.markRead(conversationId, latest.id).catch(() => {});
      }
      const me = meId;
      const conversation = keyBundle.conversation;
      if (conversation?.type === 'BATCH' && String(conversation.keyOwnerUserId || '') === me) {
        syncCanonicalKey(conversationId, conversation, keyBundle.encryptKey, identity, me).catch(() => {});
      }
      const extra = await collectKeys(keyBundle.detail?.batchEnvelopes || [], identity, me);
      const merged = extra.length ? [...keyBundle.decryptKeys, ...extra] : keyBundle.decryptKeys;
      if (extra.length) {
        await persistKeys(conversationId, merged);
        const upgraded = [];
        for (const item of items) {
          upgraded.push(
            item.plain || item.deletedAt
              ? item
              : { ...item, plain: await openPlaintext(merged, item.encryptedPayload) },
          );
        }
        if (!cancelled) {
          setMessages(upgraded);
        }
        republishOwnMessages(conversationId, me, upgraded, { ...keyBundle, decryptKeys: merged }).catch(() => {});
        return;
      }
      republishOwnMessages(conversationId, me, items, keyBundle).catch(() => {});
    })().catch((caught) => {
      if (!cancelled) {
        setThreadReady(true);
        setError(caught.message || 'Unable to open this chat');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [status, conversationId, identity, resolveConversationKey, meId]);

  async function sendDraft(event) {
    event.preventDefault();
    if (!draft.trim() || !conversationId || !identity) {
      return;
    }
    const localId = clientMessageId();
    const pendingItem = { clientMessageId: localId, localStatus: 'pending', preview: draft };
    setPending((current) => [...current, pendingItem]);
    setSendState('sending');
    setError('');
    try {
      const keyBundle = await resolveConversationKey(conversationId, identity);
      const encryptedPayload = await encryptPlaintext(keyBundle.encryptKey, draft);
      const result = await studyRoomApi.sendMessage(conversationId, {
        clientMessageId: localId,
        encryptedPayload,
      });
      const sentText = draft.trim();
      setMessages((current) =>
        placeMessage(current, {
          ...result.data.message,
          plain: sentText,
          localStatus: 'acknowledged',
          readByPeer: false,
        }),
      );
      setInbox((current) =>
        sortInbox(
          current.map((item) =>
            item.id === conversationId
              ? { ...item, preview: sentText, lastMessageAt: new Date().toISOString() }
              : item,
          ),
        ),
      );
      setPending((current) => current.filter((item) => item.clientMessageId !== localId));
      setDraft('');
      setSendState('idle');
    } catch (caught) {
      setPending((current) =>
        current.map((item) => (item.clientMessageId === localId ? { ...item, localStatus: 'failed' } : item)),
      );
      setSendState('failed');
      setError(caught.message || 'Message could not be sent');
    }
  }

  const decrypted = useMemo(() => messages, [messages]);

  useEffect(() => {
    if (tab !== 'private') {
      return undefined;
    }
    const value = query.trim();
    if (value.length < 2) {
      setPeers([]);
      return undefined;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      setSearchBusy(true);
      studyRoomApi
        .searchStudents(value)
        .then((result) => {
          if (!cancelled) {
            setPeers(result.data.items || []);
          }
        })
        .catch((caught) => {
          if (!cancelled) {
            setError(caught.message || 'Student search failed');
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearchBusy(false);
          }
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, tab]);

  function openExistingChat(item) {
    setError('');
    setPrivateId(item.id);
    setTab('private');
    setMessages([]);
    setPending([]);
    setThreadReady(false);
    setQuery('');
    setPeers([]);
  }

  function backToPrivateInbox() {
    setPrivateId(null);
    setMessages([]);
    setPending([]);
    setThreadReady(false);
    setDraft('');
  }

  function openPrivateWithPeer(senderUserId, senderDisplayName) {
    const meId = String(user?.id || user?.userId || '');
    if (!senderUserId || String(senderUserId) === meId) {
      return;
    }
    const existing = inbox.find((item) => item.peer && String(item.peer.id) === String(senderUserId));
    if (existing) {
      openExistingChat(existing);
      return;
    }
    void openPrivate(senderUserId, {
      id: senderUserId,
      displayName: senderDisplayName || 'Classmate',
    });
  }

  async function openPrivate(peerId, peerHint) {
    setError('');
    try {
      const created = await studyRoomApi.createConversation(peerId);
      const peer = peers.find((item) => item.id === peerId);
      const peerMeta = peer
        ? {
            id: peer.id,
            displayName: peer.displayName,
            registrationNumber: peer.registrationNumber,
          }
        : peerHint || created.data.peer;
      setInbox((current) => {
        if (current.some((item) => item.id === created.data.id)) {
          return sortInbox(current);
        }
        return sortInbox([
          {
            ...created.data,
            peer: peerMeta,
            preview: '',
          },
          ...current,
        ]);
      });
      setPrivateId(created.data.id);
      setTab('private');
      setMessages([]);
      setPending([]);
      setThreadReady(false);
      setQuery('');
      setPeers([]);
    } catch (caught) {
      setError(caught.message || 'Unable to open private chat');
    }
  }

  async function createFolder(event) {
    event.preventDefault();
    setError('');
    try {
      const created = await studyRoomApi.createFolder({ name: folderName });
      setFolders((current) => [created.data, ...current]);
      setFolderName('');
    } catch (caught) {
      setError(caught.message || 'Unable to create folder');
    }
  }

  async function openFolder(folder) {
    setError('');
    setActiveFolder(folder);
    try {
      const listed = await studyRoomApi.folderResources(folder.id);
      setResources(listed.data.items);
    } catch (caught) {
      setError(caught.message || 'Unable to open folder');
    }
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file || !activeFolder) {
      return;
    }
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', file.name);
      const uploaded = await studyRoomApi.uploadResource(activeFolder.id, form);
      setResources((current) => [uploaded.data, ...current]);
    } catch (caught) {
      setError(caught.message || 'Upload failed');
    } finally {
      event.target.value = '';
    }
  }

  async function reportFile(resourceId) {
    setError('');
    try {
      await studyRoomApi.reportResource(resourceId, {
        category: 'POLICY',
        description: 'Reported from Study Room',
      });
    } catch (caught) {
      setError(caught.message || 'Unable to report file');
    }
  }

  if (status === 'loading') {
    return <PageSkeleton title="Study Room" variant="workspace" />;
  }

  if (status === 'error') {
    return (
      <section className="record-page study-room">
        <PageHeader title="Study Room" purpose="Student collaboration for your batch." />
        <p className="form-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (status === 'unavailable') {
    return (
      <section className="record-page study-room">
        <PageHeader
          title="Study Room"
          purpose="Student batch space — not official course material."
        />
        <Panel title="Access unavailable">
          <EmptyState to="/">
            Study Room is available only to students with an active academic context in this department.
          </EmptyState>
        </Panel>
      </section>
    );
  }

  const openPrivateChat = inbox.find((item) => item.id === privateId);
  const conversationTitle =
    tab === 'private'
      ? privateId
        ? openPrivateChat?.peer?.displayName || 'Private conversation'
        : 'Choose a classmate'
      : 'Common batch chat';
  const conversationKicker = tab === 'private' ? 'Direct' : 'Shared';

  return (
    <section
      className={
        tab === 'private' && privateId
          ? 'record-page study-room study-room--private-thread'
          : 'record-page study-room'
      }
    >
      <PageHeader
        title="Study Room"
        purpose="Batch chat and shared files for your group."
        meta={overview?.batchLabel || overview?.contextLabel || undefined}
        actions={
          conversationId ? (
            <span className={connectionTone(socketState)} aria-live="polite">
              {socketState === 'connected' ? 'Live' : socketState}
            </span>
          ) : null
        }
      />

      {conversationId && socketState !== 'connected' ? (
        <p className="reconnect-banner" role="status">
          Real-time delivery is {socketState}. You can still send; if send fails, stay on this page and retry.
        </p>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="tab-nav" role="tablist" aria-label="Study Room sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'common'}
          className={tab === 'common' ? 'tab-nav__tab is-active' : 'tab-nav__tab'}
          onClick={() => setTab('common')}
        >
          Common chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'private'}
          className={tab === 'private' ? 'tab-nav__tab is-active' : 'tab-nav__tab'}
          onClick={() => setTab('private')}
        >
          Private chats
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'files'}
          className={tab === 'files' ? 'tab-nav__tab is-active' : 'tab-nav__tab'}
          onClick={() => setTab('files')}
        >
          Shared resources
        </button>
      </div>

      {tab !== 'files' ? (
        <div
          className={
            tab === 'private'
              ? 'study-room__workspace study-room__workspace--private'
              : 'study-room__workspace'
          }
          data-private-view={tab === 'private' ? (privateId ? 'thread' : 'list') : undefined}
        >
          {tab === 'private' ? (
            <Panel title="Private chats" kicker="Your batch" className="study-room__panel-inbox">
              <form className="inline-form study-room__search" onSubmit={(event) => event.preventDefault()}>
                <label>
                  Search by name or registration number
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search batchmates"
                    autoComplete="off"
                  />
                </label>
                {searchBusy ? <p className="filter-bar__hint">Searching…</p> : null}
              </form>
              {query.trim().length >= 2 ? (
                peers.length === 0 ? (
                  <p className="deadline-empty">No matching students in your batch.</p>
                ) : (
                  <ul className="resource-list">
                    {peers.map((peer) => (
                      <li key={peer.id} className="resource-row">
                        <div className="resource-row__main">
                          <p className="resource-row__title">{peer.displayName}</p>
                          <p className="resource-row__meta">{peer.registrationNumber}</p>
                        </div>
                        <div className="resource-row__aside">
                          <button type="button" onClick={() => openPrivate(peer.id)}>
                            Open chat
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : inbox.length === 0 ? (
                <p className="deadline-empty">No private chats yet. Search for a classmate to start one.</p>
              ) : (
                <ul className="inbox-list">
                  {inbox.map((item) => {
                    const name = item.peer?.displayName || 'Classmate';
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={item.id === privateId ? 'inbox-row is-active' : 'inbox-row'}
                          onClick={() => openExistingChat(item)}
                        >
                          <span className="chat-avatar" aria-hidden="true">
                            {name.slice(0, 2).toUpperCase()}
                          </span>
                          <span className="inbox-row__main">
                            <span className="inbox-row__title">{name}</span>
                            <span className="inbox-row__preview">
                              {item.preview || (item.lastMessage ? 'New message' : 'No messages yet')}
                            </span>
                          </span>
                          <span className="inbox-row__time">{inboxTime(item.lastMessageAt)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          ) : null}

          <Panel title={conversationTitle} kicker={conversationKicker} className="study-room__panel-chat">
            {tab === 'private' && !privateId ? (
              <EmptyState>Select a chat on the left, or search for a classmate to start one.</EmptyState>
            ) : (
              <>
                {tab === 'private' && privateId ? (
                  <div className="study-room__mobile-thread-nav">
                    <button type="button" className="study-room__mobile-back" onClick={backToPrivateInbox}>
                      ← Chats
                    </button>
                  </div>
                ) : null}
              <div className="chat-shell">
                <div className="chat-shell__banner">
                  <span className="chat-shell__lock">
                    End-to-end encrypted · AES-256-GCM
                  </span>
                  <span className="chat-shell__count">
                    {decrypted.length} message{decrypted.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="study-room__thread" aria-live="polite">
                  {!threadReady ? null : decrypted.length === 0 && pending.length === 0 ? (
                    <div className="chat-empty-state">
                      <p className="deadline-empty">No messages in this conversation yet. Say hello to your batch!</p>
                    </div>
                  ) : (
                    <ul className="study-room__messages">
                      {decrypted.map((item) => {
                        const isMine =
                          Boolean(user?.id || user?.userId) &&
                          String(item.senderUserId) === String(user?.id || user?.userId);
                        const timeLabel = formatMessageTime(item.createdAt || item.sentAt);
                        const showPeerAvatar = !isMine && tab === 'common';
                        return (
                          <li
                            key={item.id || item.clientMessageId}
                            className={
                              isMine
                                ? 'study-room__message study-room__message--mine'
                                : 'study-room__message study-room__message--peer'
                            }
                          >
                            {showPeerAvatar ? (
                              <span className="chat-avatar" aria-hidden="true">
                                {String(item.senderDisplayName || 'S')
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </span>
                            ) : null}
                            <div className="study-room__bubble">
                              <div className="study-room__message-body">
                                <ChatBubbleBody
                                  isMine={isMine}
                                  showSender={tab === 'common'}
                                  senderName={item.senderDisplayName || 'Classmate'}
                                  onSenderClick={
                                    tab === 'common' && item.senderUserId
                                      ? () =>
                                          openPrivateWithPeer(
                                            item.senderUserId,
                                            item.senderDisplayName,
                                          )
                                      : undefined
                                  }
                                  text={item.plain}
                                  deleted={Boolean(item.deletedAt)}
                                  timeLabel={timeLabel}
                                  tickStatus={deliveryTickStatus(item)}
                                />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                      {pending.map((item) => (
                        <li
                          key={item.clientMessageId}
                          className={
                            item.localStatus === 'failed'
                              ? 'study-room__message study-room__message--mine is-failed'
                              : 'study-room__message study-room__message--mine is-pending'
                          }
                        >
                          <div className="study-room__bubble">
                            <div className="study-room__message-body">
                              <ChatBubbleBody
                                isMine
                                showSender={false}
                                text={item.preview}
                                deleted={false}
                                timeLabel={formatMessageTime(new Date())}
                                tickStatus={deliveryTickStatus(item)}
                              />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <form className="study-room__composer" onSubmit={sendDraft}>
                  <label htmlFor="composer" className="visually-hidden">
                    Message. Encrypted on your device before send. Enter to send, Shift+Enter for a new line.
                  </label>
                  <div className="study-room__composer-bar">
                    <textarea
                      id="composer"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          if (draft.trim() && sendState !== 'sending') {
                            sendDraft(event);
                          }
                        }
                      }}
                      rows={1}
                      placeholder="Type a message"
                    />
                    <button type="submit" disabled={sendState === 'sending' || !draft.trim()}>
                      {sendState === 'sending' ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </form>
              </div>
              </>
            )}
          </Panel>
        </div>
      ) : (
        <div className="study-room__files">
          <Panel title="Shared folders" kicker={`${folders.length} folder${folders.length === 1 ? '' : 's'}`}>
            <p className="panel-lead">Student-created files only. These are not official lecturer resources.</p>
            <form className="inline-form" onSubmit={createFolder}>
              <label>
                New folder name
                <input
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                  required
                  maxLength={80}
                />
              </label>
              <div className="panel-actions">
                <button type="submit">Create folder</button>
              </div>
            </form>
            {folders.length === 0 ? (
              <EmptyState>No shared folders yet. Create one to start collecting student files.</EmptyState>
            ) : (
              <ul className="resource-list">
                {folders.map((folder) => (
                  <li key={folder.id} className="resource-row">
                    <div className="resource-row__main">
                      <p className="resource-row__title">{folder.name}</p>
                      <p className="resource-row__meta">
                        {activeFolder?.id === folder.id ? 'Open' : 'Student folder'}
                      </p>
                    </div>
                    <div className="resource-row__aside">
                      <button type="button" onClick={() => openFolder(folder)}>
                        {activeFolder?.id === folder.id ? 'Refresh' : 'Open'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {activeFolder ? (
            <Panel title={activeFolder.name} kicker={`${resources.length} file${resources.length === 1 ? '' : 's'}`}>
              <label className="study-room__upload">
                Upload a student file
                <input type="file" onChange={uploadFile} />
              </label>
              {resources.length === 0 ? (
                <EmptyState>No files in this folder yet.</EmptyState>
              ) : (
                <ul className="resource-list">
                  {resources.map((resource) => (
                    <li key={resource.id} className="resource-row">
                      <div className="resource-row__main">
                        <p className="resource-row__title">{resource.displayFilename}</p>
                        <p className="resource-row__meta">
                          <span className={resourceStatusClass(resource.studentStatusLabel || resource.studentStatus)}>
                            {resource.studentStatusLabel || resource.studentStatus}
                          </span>
                        </p>
                      </div>
                      <div className="resource-row__aside">
                        {resource.downloadable ? (
                          <a href={studyRoomApi.downloadUrl(resource.id)}>Download</a>
                        ) : null}
                        <button type="button" onClick={() => reportFile(resource.id)}>
                          Report
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}
        </div>
      )}
    </section>
  );
}

