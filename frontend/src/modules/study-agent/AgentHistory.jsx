import { useEffect, useState } from 'react';
import { studyAgentApi } from './study-agent-api.js';
import { EmptyState } from '../../ui/EmptyState.jsx';

function formatWhen(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : '';
}

export function sessionLabel(session) {
  if (session.subjectCode) {
    return session.subjectCode;
  }
  return session.mode === 'SUBJECT' ? 'Subject' : 'Open study';
}

/** Previous conversations. Opening one continues it in the same chat. */
export function AgentHistory({ activeId, onOpen, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    studyAgentApi
      .sessions({ resumable: true })
      .then((res) => {
        if (active) {
          setSessions(res.data.items);
          setStatus('ready');
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.message || 'Could not load your previous chats.');
          setStatus('error');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function remove(session) {
    try {
      await studyAgentApi.archiveSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (err) {
      setError(err?.message || 'Could not remove the chat.');
    }
  }

  return (
    <section className="study-agent__history" aria-label="Previous chats">
      <div className="study-agent__history-head">
        <h3>Previous chats</h3>
        <button type="button" className="study-agent__back" onClick={onClose}>
          Close
        </button>
      </div>
      {status === 'loading' ? <p className="deadline-empty">Loading chats…</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {status === 'ready' && !sessions.length ? <EmptyState>You have no previous chats yet.</EmptyState> : null}
      <ul className="study-agent__list">
        {sessions.map((session) => (
          <li key={session.id} className="study-agent__session-row">
            <button
              type="button"
              className={session.id === activeId ? 'study-agent__row is-active' : 'study-agent__row'}
              onClick={() => onOpen(session)}
            >
              <span className="study-agent__row-code">{sessionLabel(session)}</span>
              <span className="study-agent__row-title">{session.title}</span>
              <span className="study-agent__row-meta">
                {session.messageCount} messages · {formatWhen(session.lastActivityAt)}
              </span>
            </button>
            <button
              type="button"
              className="study-agent__remove"
              aria-label={`Remove chat ${session.title}`}
              onClick={() => remove(session)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
