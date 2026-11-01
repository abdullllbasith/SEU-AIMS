import { useEffect, useState } from 'react';
import { studyAgentApi } from './study-agent-api.js';
import { AgentChat } from './AgentChat.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';

/**
 * Student-only AI tutor, shown as a tab inside the Study Room. One chat: the agent decides from each message
 * whether the student is studying a subject, exploring freely, or solving a question from a file.
 */
export function StudyAgentWorkspace() {
  const [status, setStatus] = useState('loading');
  // Changing `key` starts a fresh AgentChat; `session` is null for a new chat.
  const [chat, setChat] = useState({ key: 0, session: null });

  useEffect(() => {
    let active = true;
    studyAgentApi
      .access()
      .then(() => active && setStatus('ready'))
      .catch((err) => active && setStatus(err?.status === 403 ? 'unavailable' : 'error'));
    return () => {
      active = false;
    };
  }, []);

  if (status === 'loading') {
    return <p className="deadline-empty">Loading Study Agent…</p>;
  }
  if (status === 'unavailable') {
    return <EmptyState>Study Agent needs an active academic context. Contact your department if this looks wrong.</EmptyState>;
  }
  if (status === 'error') {
    return (
      <p className="form-error" role="alert">
        Study Agent could not be loaded. Refresh the page to try again.
      </p>
    );
  }

  return (
    <div className="study-agent">
      <AgentChat
        key={chat.session ? `session-${chat.session.id}` : `new-${chat.key}`}
        session={chat.session}
        onNewChat={() => setChat((current) => ({ key: current.key + 1, session: null }))}
        onOpenSession={(session) => setChat((current) => ({ key: current.key, session }))}
      />
    </div>
  );
}
