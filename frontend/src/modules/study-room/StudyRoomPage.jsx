import { useCallback, useEffect, useMemo, useState } from 'react';
import { studyRoomApi } from './study-room-api.js';
import { connectStudyRoomSocket } from './socket-client.js';
import { loadOrCreateIdentity } from './key-store.js';
import {
  decryptPayload,
  derivePrivateConversationKey,
  encryptPlaintext,
  exportPrivateJwk,
  exportPublicJwk,
  generateGroupKey,
  generateIdentityKeyPair,
  importPrivateJwk,
  importPublicJwk,
  exportRawKey,
  unwrapGroupKey,
  wrapGroupKey,
} from './encryption.js';
import { useAuth } from '../../state/AuthProvider.jsx';

function clientMessageId() {
  return crypto.randomUUID ? crypto.randomUUID() : `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function StudyRoomPage() {
  const { user } = useAuth();
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

  const conversationId = tab === 'private' ? privateId : overview?.commonConversation?.id;

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

  const resolveConversationKey = useCallback(
    async (id, currentIdentity) => {
      const detail = await studyRoomApi.getConversation(id);
      const conversation = detail.data.conversation;
      if (conversation.type === 'PRIVATE') {
        const peerId = conversation.participantUserIds.find((item) => item !== user.userId && item !== user.id);
        const resolvedPeer = (conversation.participantUserIds || []).find((item) => String(item) !== String(user.id || user.userId));
        const keyResponse = await studyRoomApi.getPublicKey(resolvedPeer);
        if (!keyResponse.data.publicKeyJwk) {
          throw new Error('The other student has not published a public key yet');
        }
        const peerPublic = await importPublicJwk(keyResponse.data.publicKeyJwk);
        const participantKey = [...conversation.participantUserIds].sort().join(':');
        return derivePrivateConversationKey(currentIdentity.privateKey, peerPublic, conversation.id, participantKey);
      }
      if (detail.data.myEnvelope) {
        const wrapper = await studyRoomApi.getPublicKey(detail.data.myEnvelope.wrappedByUserId);
        const wrapperPublic = await importPublicJwk(wrapper.data.publicKeyJwk);
        return unwrapGroupKey(detail.data.myEnvelope, currentIdentity.privateKey, wrapperPublic);
      }
      const groupKey = await generateGroupKey();
      const raw = await exportRawKey(groupKey);
      const selfWrap = await wrapGroupKey(raw, currentIdentity.privateKey, currentIdentity.publicKey);
      await studyRoomApi.putEnvelopes(id, {
        keyVersion: conversation.currentKeyVersion,
        envelopes: [{ recipientUserId: user.id || user.userId, ...selfWrap }],
      });
      return groupKey;
    },
    [user],
  );

  useEffect(() => {
    if (status !== 'ready' || !conversationId || !identity) {
      return undefined;
    }
    let cancelled = false;
    const socket = connectStudyRoomSocket();
    socket.on('connect', () => {
      setSocketState('connected');
      socket.emit('study-room:join', { conversationId }, () => {});
    });
    socket.on('disconnect', () => setSocketState('disconnected'));
    socket.on('connect_error', () => setSocketState('unauthorized'));
    socket.on('study-room:message:new', (message) => {
      setMessages((current) => {
        if (current.some((item) => item.id === message.id || item.clientMessageId === message.clientMessageId)) {
          return current;
        }
        return [...current, { ...message, localStatus: 'acknowledged' }];
      });
    });
    (async () => {
      const history = await studyRoomApi.messages(conversationId);
      if (!cancelled) {
        setMessages(history.data.items.map((item) => ({ ...item, localStatus: 'acknowledged' })));
      }
    })().catch((caught) => {
      if (!cancelled) {
        setError(caught.message);
      }
    });
    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [status, conversationId, identity]);

  async function sendDraft(event) {
    event.preventDefault();
    if (!draft.trim() || !conversationId || !identity) {
      return;
    }
    const localId = clientMessageId();
    const pendingItem = { clientMessageId: localId, localStatus: 'pending', preview: draft };
    setPending((current) => [...current, pendingItem]);
    setSendState('sending');
    try {
      const key = await resolveConversationKey(conversationId, identity);
      const encryptedPayload = await encryptPlaintext(key, draft);
      const result = await studyRoomApi.sendMessage(conversationId, {
        clientMessageId: localId,
        encryptedPayload,
      });
      setMessages((current) => [...current, { ...result.data.message, localStatus: 'acknowledged' }]);
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

  async function searchPeers(event) {
    event.preventDefault();
    const result = await studyRoomApi.searchStudents(query);
    setPeers(result.data.items);
  }

  async function openPrivate(peerId) {
    const created = await studyRoomApi.createConversation(peerId);
    setPrivateId(created.data.id);
    setTab('private');
  }

  async function createFolder(event) {
    event.preventDefault();
    const created = await studyRoomApi.createFolder({ name: folderName });
    setFolders((current) => [created.data, ...current]);
    setFolderName('');
  }

  async function openFolder(folder) {
    setActiveFolder(folder);
    const listed = await studyRoomApi.folderResources(folder.id);
    setResources(listed.data.items);
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file || !activeFolder) {
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('title', file.name);
    const uploaded = await studyRoomApi.uploadResource(activeFolder.id, form);
    setResources((current) => [uploaded.data, ...current]);
    event.target.value = '';
  }

  if (status === 'loading') {
    return <p>Opening Study Room…</p>;
  }
  if (status === 'error') {
    return <p className="form-error">{error}</p>;
  }
  if (status === 'unavailable') {
    return (
      <section>
        <h1>Study Room</h1>
        <p>Study Room is available only to students with an active academic context in this department.</p>
      </section>
    );
  }

  return (
    <section className="study-room">
      <h1>Study Room</h1>
      <p>
        Student collaboration space for your batch. This is not official course material. Messages are encrypted on
        your device before they are stored.
      </p>
      <p aria-live="polite">Connection: {socketState}</p>
      {socketState !== 'connected' ? (
        <p className="reconnect-banner" role="status">
          Real-time delivery is {socketState}. You can still send; if send fails, stay on this page and retry.
        </p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <div className="tab-nav" role="tablist">
        <button type="button" className={tab === 'common' ? 'tab-nav__tab is-active' : 'tab-nav__tab'} onClick={() => setTab('common')}>
          Common chat
        </button>
        <button type="button" className={tab === 'private' ? 'tab-nav__tab is-active' : 'tab-nav__tab'} onClick={() => setTab('private')}>
          Private chats
        </button>
        <button type="button" className={tab === 'files' ? 'tab-nav__tab is-active' : 'tab-nav__tab'} onClick={() => setTab('files')}>
          Student shared resources
        </button>
      </div>

      {tab !== 'files' ? (
        <div>
          {tab === 'private' ? (
            <form onSubmit={searchPeers}>
              <label>
                Find a student in your batch
                <input value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} />
              </label>
              <button type="submit">Search</button>
              {peers.length === 0 ? <p>No private chats selected yet.</p> : null}
              <ul>
                {peers.map((peer) => (
                  <li key={peer.id}>
                    <button type="button" onClick={() => openPrivate(peer.id)}>
                      {peer.displayName} ({peer.registrationNumber})
                    </button>
                  </li>
                ))}
              </ul>
            </form>
          ) : null}
          <div className="study-room__messages" aria-live="polite">
            {decrypted.length === 0 && pending.length === 0 ? <p>No messages in this conversation yet.</p> : null}
            <ul>
              {decrypted.map((item) => (
                <li key={item.id || item.clientMessageId}>
                  <span>{item.deletedAt ? '[removed]' : item.encryptedPayload?.ciphertext?.slice(0, 24) + '…'}</span>
                  <small> {item.localStatus === 'acknowledged' ? 'sent' : item.localStatus}</small>
                  <MessagePlain identity={identity} conversationId={conversationId} message={item} resolveKey={resolveConversationKey} />
                </li>
              ))}
              {pending.map((item) => (
                <li key={item.clientMessageId}>
                  {item.preview} <small>{item.localStatus}</small>
                </li>
              ))}
            </ul>
          </div>
          <form onSubmit={sendDraft}>
            <label htmlFor="composer">Message</label>
            <textarea id="composer" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <button type="submit" disabled={sendState === 'sending'}>
              Send
            </button>
          </form>
        </div>
      ) : (
        <div>
          <p>Student-created files. These are not official lecturer resources.</p>
          <form onSubmit={createFolder}>
            <label>
              New folder
              <input value={folderName} onChange={(event) => setFolderName(event.target.value)} required />
            </label>
            <button type="submit">Create folder</button>
          </form>
          {folders.length === 0 ? <p>No shared folders yet.</p> : null}
          <ul>
            {folders.map((folder) => (
              <li key={folder.id}>
                <button type="button" onClick={() => openFolder(folder)}>
                  {folder.name}
                </button>
              </li>
            ))}
          </ul>
          {activeFolder ? (
            <div>
              <h2>{activeFolder.name}</h2>
              <label>
                Upload a student file
                <input type="file" onChange={uploadFile} />
              </label>
              {resources.length === 0 ? <p>No files in this folder yet.</p> : null}
              <ul>
                {resources.map((resource) => (
                  <li key={resource.id}>
                    {resource.displayFilename} — {resource.studentStatusLabel || resource.studentStatus}
                    {resource.downloadable ? (
                      <a href={studyRoomApi.downloadUrl(resource.id)}> Download</a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => studyRoomApi.reportResource(resource.id, { category: 'POLICY', description: 'Reported from Study Room' })}
                    >
                      Report
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function MessagePlain({ identity, conversationId, message, resolveKey }) {
  const [text, setText] = useState('');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!identity || !conversationId || message.deletedAt) {
        return;
      }
      try {
        const key = await resolveKey(conversationId, identity);
        const plain = await decryptPayload(key, message.encryptedPayload);
        if (!cancelled) {
          setText(plain);
        }
      } catch {
        if (!cancelled) {
          setText('(Unable to decrypt on this device)');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity, conversationId, message, resolveKey]);
  return <div>{text}</div>;
}
