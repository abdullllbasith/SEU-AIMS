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
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

function clientMessageId() {
  return crypto.randomUUID ? crypto.randomUUID() : `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
  const [searchBusy, setSearchBusy] = useState(false);

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
        const resolvedPeer = (conversation.participantUserIds || []).find(
          (item) => String(item) !== String(user.id || user.userId),
        );
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
    setError('');
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

  async function openPrivate(peerId) {
    setError('');
    try {
      const created = await studyRoomApi.createConversation(peerId);
      setPrivateId(created.data.id);
      setTab('private');
      setMessages([]);
      setPending([]);
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
          purpose="Student collaboration space for your batch. This is not official course material."
        />
        <Panel title="Access unavailable">
          <EmptyState to="/">
            Study Room is available only to students with an active academic context in this department.
          </EmptyState>
        </Panel>
      </section>
    );
  }

  const conversationTitle =
    tab === 'private' ? (privateId ? 'Private conversation' : 'Choose a classmate') : 'Common batch chat';
  const conversationKicker = tab === 'private' ? 'Direct' : 'Shared';

  return (
    <section className="record-page study-room">
      <PageHeader
        title="Study Room"
        purpose="Student collaboration for your batch. Messages are encrypted on your device before they are stored. This is not official course material."
        meta={overview?.batchLabel || overview?.contextLabel || undefined}
        actions={
          <span className={connectionTone(socketState)} aria-live="polite">
            {socketState === 'connected' ? 'Live' : socketState}
          </span>
        }
      />

      {socketState !== 'connected' ? (
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
        <div className="study-room__workspace">
          {tab === 'private' ? (
            <Panel title="Find a classmate" kicker="Your batch">
              <form className="inline-form study-room__search" onSubmit={(event) => event.preventDefault()}>
                <label>
                  Search by name or registration number
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Type a name or registration number"
                    autoComplete="off"
                  />
                </label>
                {searchBusy ? <p className="filter-bar__hint">Searching…</p> : null}
              </form>
              {peers.length === 0 ? (
                <p className="deadline-empty">
                  {query.trim().length >= 2
                    ? 'No matching students in your batch.'
                    : 'Search to start or resume a private conversation.'}
                </p>
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
              )}
            </Panel>
          ) : null}

          <Panel title={conversationTitle} kicker={conversationKicker}>
            {tab === 'private' && !privateId ? (
              <EmptyState>Select a classmate above to open a private encrypted chat.</EmptyState>
            ) : (
              <>
                <div className="study-room__thread" aria-live="polite">
                  {decrypted.length === 0 && pending.length === 0 ? (
                    <p className="deadline-empty">No messages in this conversation yet.</p>
                  ) : (
                    <ul className="study-room__messages">
                      {decrypted.map((item) => (
                        <li key={item.id || item.clientMessageId} className="study-room__message">
                          <div className="study-room__message-body">
                            {item.deletedAt ? (
                              <p className="study-room__message-text is-removed">[removed]</p>
                            ) : (
                              <MessagePlain
                                identity={identity}
                                conversationId={conversationId}
                                message={item}
                                resolveKey={resolveConversationKey}
                              />
                            )}
                          </div>
                          <span className="study-room__message-meta">
                            {item.localStatus === 'acknowledged' ? 'Delivered' : item.localStatus}
                          </span>
                        </li>
                      ))}
                      {pending.map((item) => (
                        <li
                          key={item.clientMessageId}
                          className={
                            item.localStatus === 'failed'
                              ? 'study-room__message is-failed'
                              : 'study-room__message is-pending'
                          }
                        >
                          <div className="study-room__message-body">
                            <p className="study-room__message-text">{item.preview}</p>
                          </div>
                          <span className="study-room__message-meta">{item.localStatus}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <form className="study-room__composer" onSubmit={sendDraft}>
                  <label htmlFor="composer">Message</label>
                  <textarea
                    id="composer"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={3}
                    placeholder="Write a message — encrypted before send"
                  />
                  <div className="panel-actions">
                    <button type="submit" disabled={sendState === 'sending' || !draft.trim()}>
                      {sendState === 'sending' ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </form>
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
  return <p className="study-room__message-text">{text || 'Decrypting…'}</p>;
}
