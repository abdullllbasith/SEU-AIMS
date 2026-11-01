import { useCallback, useEffect, useRef, useState } from 'react';
import { studyAgentApi } from './study-agent-api.js';
import { MessageContent } from './MessageContent.jsx';
import { AgentComposer } from './AgentComposer.jsx';
import { AgentHistory } from './AgentHistory.jsx';
import { AgentIcon } from './agent-icons.jsx';
import { AgentThinking } from './AgentThinking.jsx';
import { isImageType } from './attachment-rules.js';
import { useAttachments } from './useAttachments.js';

export const SOURCE_LABELS = {
  OFFICIAL: 'Official resource',
  SHARED: 'Shared resource',
  UPLOAD: 'Your upload',
  WEB: 'Web',
  ACADEMIC_RECORD: 'Official record',
};

const DEFAULT_TITLE = 'New study session';

/** Starting points only: they fill the box. The agent works out the rest from what the student writes. */
const STARTERS = [
  { label: 'Explain a topic from my subjects', text: 'Explain this topic from my course: ' },
  { label: 'Solve a question from a photo', text: 'Solve the attached question step by step.' },
  { label: 'Teach me something new', text: 'Teach me about ' },
];

function describeError(error) {
  if (error?.status === 503) {
    return 'The AI tutor is not available right now. Your question was not answered, so try again in a moment.';
  }
  return error?.message || 'Something went wrong. Try again.';
}

function isHttps(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** The subject the agent is working in. Open study has no label, so nothing is shown for it. */
export function routeLabel(route) {
  if (!route) {
    return '';
  }
  if (route.mode === 'SUBJECT') {
    return [route.subjectCode, route.subjectName].filter(Boolean).join(' ') || 'Subject study';
  }
  return '';
}

function sessionContext(session) {
  if (!session || session.mode === 'AUTO') {
    return null;
  }
  return session.mode === 'SUBJECT'
    ? { mode: 'SUBJECT', subjectCode: session.subjectCode, subjectName: session.subjectName }
    : { mode: 'FREE' };
}

function SourceList({ sources: allSources }) {
  // Answers from general knowledge carry no label; only real sources are listed.
  const sources = allSources?.filter((source) => source.kind !== 'AI_KNOWLEDGE');
  if (!sources?.length) {
    return null;
  }
  return (
    <ol className="study-agent__sources" aria-label="Sources">
      {sources.map((source, index) => {
        const label =
          `${sources.length > 1 || source.page ? `${index + 1}. ` : ''}${source.title}${
            source.page ? `, page ${source.page}` : ''
          }${source.section ? `, ${source.section}` : ''}`;
        return (
          <li key={`${source.kind}-${source.fileId || source.url || index}-${source.page ?? ''}`}>
            <span className={`study-agent__source-kind study-agent__source-kind--${source.kind.toLowerCase()}`}>
              {SOURCE_LABELS[source.kind] || source.kind}
            </span>
            {label && source.url && isHttps(source.url) ? (
              <a className="study-agent__source-title" href={source.url} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            ) : label ? (
              <span className="study-agent__source-title">{label}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function MessageAttachments({ attachments }) {
  if (!attachments?.length) {
    return null;
  }
  return (
    <ul className="study-agent__sent-files" aria-label="Attached files">
      {attachments.map((item) => {
        const src = item.previewUrl || (item.id ? studyAgentApi.attachmentContentUrl(item.id) : null);
        return (
          <li key={item.id || item.name}>
            {isImageType(item.mimeType) && src ? (
              <img className="study-agent__sent-image" src={src} alt={item.name} loading="lazy" />
            ) : (
              <span className="study-agent__sent-file">
                <AgentIcon name="file" />
                <span className="study-agent__chip-name">{item.name}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Welcome({ onPick }) {
  return (
    <div className="study-agent__welcome">
      <span className="study-agent__welcome-icon" aria-hidden="true">
        <AgentIcon name="spark" />
      </span>
      <h3>What would you like to study?</h3>
      <p>
        Ask about your subjects, solve a question from a photo or PDF, or explore any topic. The agent works out where to
        look, and every answer shows where it came from.
      </p>
      <div className="study-agent__starters" role="group" aria-label="Ways to start">
        {STARTERS.map((starter) => (
          <button key={starter.label} type="button" className="study-agent__starter" onClick={() => onPick(starter.text)}>
            {starter.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * One conversation with the Study Agent. `session` is null for a new chat; the session is created the
 * first time the student sends something or attaches a file.
 */
export function AgentChat({ session: initialSession, onNewChat, onOpenSession }) {
  const [session, setSession] = useState(initialSession);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState(initialSession ? 'loading' : 'ready');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState('');
  const [research, setResearch] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const sessionRef = useRef(initialSession);
  const creating = useRef(null);

  const getSessionId = useCallback(async () => {
    if (sessionRef.current) {
      return sessionRef.current.id;
    }
    if (!creating.current) {
      creating.current = studyAgentApi
        .createSession({ mode: 'AUTO' })
        .then((res) => {
          sessionRef.current = res.data;
          setSession(res.data);
          return res.data;
        })
        .finally(() => {
          creating.current = null;
        });
    }
    return (await creating.current).id;
  }, []);

  const attachments = useAttachments(getSessionId);
  const initialId = initialSession?.id;

  useEffect(() => {
    if (!initialId) {
      return undefined;
    }
    let active = true;
    setStatus('loading');
    studyAgentApi
      .session(initialId)
      .then((res) => {
        if (!active) {
          return;
        }
        setMessages(res.data.messages);
        setHasMore(Boolean(res.data.hasMore));
        setStatus('ready');
      })
      .catch((err) => {
        if (active) {
          setError(describeError(err));
          setStatus('error');
        }
      });
    return () => {
      active = false;
    };
  }, [initialId]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, [messages.length, sending]);

  const loadOlder = useCallback(async () => {
    if (!messages.length || !sessionRef.current) {
      return;
    }
    try {
      const res = await studyAgentApi.session(sessionRef.current.id, messages[0].id);
      setMessages((current) => [...res.data.messages, ...current]);
      setHasMore(Boolean(res.data.hasMore));
    } catch (err) {
      setError(describeError(err));
    }
  }, [messages]);

  /** Shared by the Send button and the quick actions. Quick actions never touch the draft or the tray. */
  async function submit({ content, intent, attachmentIds = [], fromComposer }) {
    if (sending) {
      return;
    }
    const pendingId = `pending-${Date.now()}`;
    setError('');
    setNote('');
    setSending(true);
    if (fromComposer) {
      setDraft('');
    }
    setMessages((current) => [
      ...current,
      {
        id: pendingId,
        role: 'student',
        content: content || 'Please solve the attached question.',
        sources: [],
        attachments: fromComposer
          ? attachments.items
              .filter((item) => item.status === 'READY')
              .map((item) => ({ id: item.id, name: item.name, mimeType: item.mimeType, previewUrl: item.previewUrl }))
          : [],
      },
    ]);
    try {
      const sessionId = await getSessionId();
      const payload = { content, ...(intent ? { intent } : {}), ...(attachmentIds.length ? { attachmentIds } : {}) };
      const res = await studyAgentApi.sendMessage(sessionId, payload);
      const { userMessage, agentMessage, indexing } = res.data;
      setMessages((current) => [...current.filter((item) => item.id !== pendingId), userMessage, agentMessage]);
      setSession((current) =>
        current && current.title === DEFAULT_TITLE
          ? { ...current, title: (content || userMessage.content).replace(/\s+/g, ' ').slice(0, 60) }
          : current,
      );
      if (fromComposer) {
        attachments.clear();
        setResearch(false);
      }
      if (indexing?.pendingDocuments > 0) {
        setNote(
          `${indexing.pendingDocuments} course document${indexing.pendingDocuments === 1 ? ' is' : 's are'} still being prepared, so some answers may not cite them yet.`,
        );
      }
    } catch (err) {
      setMessages((current) => current.filter((item) => item.id !== pendingId));
      if (fromComposer) {
        setDraft(content);
      }
      setError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  function sendFromComposer() {
    submit({
      content: draft.trim(),
      intent: research ? 'research' : undefined,
      attachmentIds: attachments.readyIds,
      fromComposer: true,
    });
  }

  function onDrop(event) {
    event.preventDefault();
    setDropping(false);
    if (status === 'ready' && event.dataTransfer?.files?.length) {
      attachments.addFiles(event.dataTransfer.files);
    }
  }

  function pickStarter(text) {
    setDraft(text);
    inputRef.current?.focus();
  }

  const lastRoute = [...messages].reverse().find((message) => message.role === 'agent' && message.route)?.route;
  const context = routeLabel(lastRoute || sessionContext(session));
  const title = session?.title && session.title !== DEFAULT_TITLE ? session.title : 'New chat';
  const showWelcome = status === 'ready' && !messages.length && !sending;

  return (
    <div
      className="study-agent__chat"
      onDragOver={(event) => {
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setDropping(false);
        }
      }}
      onDrop={onDrop}
    >
      <div className="study-agent__chat-head">
        <div className="study-agent__chat-heading">
          <h2 className="study-agent__chat-title">{title}</h2>
          {context ? <p className="study-agent__chat-subject">{context}</p> : null}
        </div>
        <div className="study-agent__chat-actions">
          <button type="button" className="study-agent__action" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>
            <AgentIcon name="history" />
            <span>History</span>
          </button>
          <button type="button" className="study-agent__action" onClick={onNewChat}>
            <AgentIcon name="plus" />
            <span>New chat</span>
          </button>
        </div>
      </div>

      {historyOpen ? (
        <AgentHistory
          activeId={session?.id}
          onClose={() => setHistoryOpen(false)}
          onOpen={(item) => {
            setHistoryOpen(false);
            onOpenSession(item);
          }}
        />
      ) : null}

      <div className="study-agent__thread" ref={threadRef} role="log" aria-live="polite" aria-label="Study Agent conversation">
        {status === 'loading' ? <p className="deadline-empty">Loading conversation…</p> : null}
        {status === 'error' ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {status === 'ready' && hasMore ? (
          <button type="button" className="study-agent__older" onClick={loadOlder}>
            Show earlier messages
          </button>
        ) : null}
        {showWelcome ? <Welcome onPick={pickStarter} /> : null}
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'student'
                ? 'study-agent__message study-agent__message--student'
                : 'study-agent__message study-agent__message--agent'
            }
          >
            <p className="study-agent__message-who">
              {message.role === 'student' ? 'You' : 'Study Agent'}
            </p>
            {message.role === 'student' ? (
              <>
                <MessageAttachments attachments={message.attachments} />
                <p className="study-agent__plain">{message.content}</p>
              </>
            ) : (
              <>
                <MessageContent text={message.content} sourceCount={message.sources?.length || 0} images={message.attachments} />
                <SourceList sources={message.sources} />
              </>
            )}
            {message.failed ? <p className="study-agent__unanswered">This question was not answered.</p> : null}
          </div>
        ))}
        {sending ? <AgentThinking /> : null}
      </div>

      {note ? (
        <p className="study-agent__note" role="status">
          {note}
        </p>
      ) : null}
      {error && status === 'ready' ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <AgentComposer
        hasMessages={messages.some((message) => message.role === 'agent')}
        sending={sending}
        disabled={status !== 'ready'}
        draft={draft}
        onDraft={setDraft}
        attachments={attachments}
        research={research}
        onResearch={setResearch}
        dropping={dropping}
        inputRef={inputRef}
        onSend={sendFromComposer}
        onQuick={(action) => submit({ content: action.content, intent: action.intent })}
      />
    </div>
  );
}
