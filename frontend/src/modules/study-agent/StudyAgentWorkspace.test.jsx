import { createElement } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { StudyAgentWorkspace } from './StudyAgentWorkspace.jsx';

vi.mock('./study-agent-api.js', () => ({
  studyAgentApi: {
    access: vi.fn(),
    sessions: vi.fn(),
    createSession: vi.fn(),
    session: vi.fn(),
    archiveSession: vi.fn(),
    sendMessage: vi.fn(),
    uploadAttachments: vi.fn(),
    attachmentStatus: vi.fn(),
    removeAttachment: vi.fn(),
    attachmentContentUrl: (id) => '/api/study-agent/attachments/' + id + '/content',
  },
}));

import { studyAgentApi } from './study-agent-api.js';

const autoSession = { id: 's1', mode: 'AUTO', subjectCode: '', subjectName: '', title: 'New study session', messageCount: 0 };
const subjectSession = {
  id: 's3',
  mode: 'SUBJECT',
  subjectCode: 'ICT101',
  subjectName: 'Database Systems',
  title: 'Normalization',
  messageCount: 2,
  lastActivityAt: '2026-10-30T10:00:00Z',
};

describe('StudyAgentWorkspace', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    studyAgentApi.access.mockResolvedValue({ data: { enabled: true } });
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  async function flush() {
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  async function renderWorkspace() {
    await act(async () => {
      root.render(createElement(StudyAgentWorkspace));
    });
    await flush();
  }

  function click(element) {
    return act(async () => {
      element.click();
    });
  }

  function buttonWithText(text) {
    return [...container.querySelectorAll('button')].find((button) => button.textContent.includes(text));
  }

  async function type(text) {
    const textarea = container.querySelector('#study-agent-input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, text);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function submit() {
    return act(async () => {
      container.querySelector('.study-agent__composer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  it('opens straight into one chat with an input and no mode picker', async () => {
    await renderWorkspace();
    expect(container.textContent).toContain('What would you like to study?');
    expect(container.querySelector('#study-agent-input')).not.toBeNull();
    expect(container.textContent).not.toContain('Study a subject');
    expect(container.textContent).not.toContain('Continue learning');
    expect(studyAgentApi.createSession).not.toHaveBeenCalled();
  });

  it('explains when the student has no academic context', async () => {
    studyAgentApi.access.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    await renderWorkspace();
    expect(container.textContent).toContain('needs an active academic context');
    expect(container.querySelector('#study-agent-input')).toBeNull();
  });

  it('fills the box from a starter without sending anything', async () => {
    await renderWorkspace();
    await click(buttonWithText('Teach me something new'));
    expect(container.querySelector('#study-agent-input').value).toBe('Teach me about ');
    expect(studyAgentApi.sendMessage).not.toHaveBeenCalled();
  });

  it('creates an agent-routed session on the first message and shows what the agent chose', async () => {
    studyAgentApi.createSession.mockResolvedValue({ data: autoSession });
    studyAgentApi.sendMessage.mockResolvedValue({
      data: {
        userMessage: { id: 'u1', role: 'student', content: 'What is 1NF?', sources: [], attachments: [] },
        agentMessage: {
          id: 'a1',
          role: 'agent',
          content: 'It needs **atomic** values [1].',
          sources: [{ kind: 'OFFICIAL', title: 'Lecture 3', page: 4, section: '1 Normalization', fileId: 'f1' }],
          attachments: [],
          route: { mode: 'SUBJECT', subjectCode: 'ICT101', subjectName: 'Database Systems' },
        },
        indexing: { pendingDocuments: 2 },
      },
    });
    await renderWorkspace();
    await type('What is 1NF?');
    await submit();
    await flush();

    expect(studyAgentApi.createSession).toHaveBeenCalledWith({ mode: 'AUTO' });
    expect(studyAgentApi.sendMessage).toHaveBeenCalledWith('s1', { content: 'What is 1NF?' });
    expect(container.querySelector('.study-agent__prose strong')?.textContent).toBe('atomic');
    expect(container.querySelector('.study-agent__cite')?.textContent).toBe('1');
    expect(container.querySelector('.study-agent__source-kind--official')?.textContent).toBe('Official resource');
    expect(container.querySelector('.study-agent__message-route')).toBeNull();
    expect(container.querySelector('.study-agent__chat-subject')?.textContent).toBe('ICT101 Database Systems');
    expect(container.querySelector('.study-agent__chat-title')?.textContent).toBe('What is 1NF?');
    expect(container.textContent).toContain('2 course documents are still being prepared');
    expect(container.querySelector('#study-agent-input').value).toBe('');

    // The second message reuses the session instead of creating another.
    studyAgentApi.sendMessage.mockResolvedValue({
      data: {
        userMessage: { id: 'u2', role: 'student', content: 'And 2NF?', sources: [], attachments: [] },
        agentMessage: { id: 'a2', role: 'agent', content: 'Next.', sources: [], attachments: [], route: { mode: 'FREE' } },
        indexing: { pendingDocuments: 0 },
      },
    });
    await type('And 2NF?');
    await submit();
    await flush();
    expect(studyAgentApi.createSession).toHaveBeenCalledTimes(1);
    expect(studyAgentApi.sendMessage).toHaveBeenLastCalledWith('s1', { content: 'And 2NF?' });
    expect(container.querySelector('.study-agent__chat-subject')).toBeNull();
  });

  it('shows an image the agent points back at, only for images that were attached', async () => {
    studyAgentApi.createSession.mockResolvedValue({ data: autoSession });
    studyAgentApi.sendMessage.mockResolvedValue({
      data: {
        userMessage: { id: 'u1', role: 'student', content: 'Explain', sources: [], attachments: [] },
        agentMessage: {
          id: 'a1',
          role: 'agent',
          content: 'Look at this part:\n[image:1]\nThen this:\n[image:2]',
          sources: [],
          attachments: [{ id: 'f1', name: 'circuit.png', mimeType: 'image/png' }],
          route: { mode: 'FREE' },
        },
        indexing: { pendingDocuments: 0 },
      },
    });
    await renderWorkspace();
    await type('Explain');
    await submit();
    await flush();
    const figures = container.querySelectorAll('.study-agent__figure img');
    expect(figures).toHaveLength(1);
    expect(figures[0].getAttribute('src')).toBe('/api/study-agent/attachments/f1/content');
    expect(figures[0].getAttribute('alt')).toBe('circuit.png');
    expect(container.textContent).not.toContain('[image:');
  });

  it('restores the question and shows a clear error when the AI service fails', async () => {
    studyAgentApi.createSession.mockResolvedValue({ data: autoSession });
    studyAgentApi.sendMessage.mockRejectedValue(Object.assign(new Error('AI down'), { status: 503 }));
    await renderWorkspace();
    await type('Will this fail?');
    await submit();
    await flush();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('AI tutor is not available');
    expect(container.querySelector('#study-agent-input').value).toBe('Will this fail?');
    expect(container.querySelector('.study-agent__message--student')).toBeNull();
  });

  it('continues a previous chat from History and shows its messages', async () => {
    studyAgentApi.sessions.mockResolvedValue({ data: { items: [subjectSession] } });
    studyAgentApi.session.mockResolvedValue({
      data: {
        session: subjectSession,
        hasMore: false,
        messages: [
          { id: 'm1', role: 'student', content: 'What is 1NF?', sources: [], attachments: [] },
          { id: 'm2', role: 'agent', content: 'Atomic values.', sources: [], attachments: [] },
        ],
      },
    });
    await renderWorkspace();
    await click(buttonWithText('History'));
    await flush();
    expect(container.textContent).toContain('Normalization');
    await click(container.querySelector('.study-agent__history .study-agent__row'));
    await flush();

    expect(studyAgentApi.session).toHaveBeenCalledWith('s3');
    expect(container.querySelector('.study-agent__history')).toBeNull();
    expect(container.textContent).toContain('What is 1NF?');
    expect(container.querySelector('.study-agent__chat-subject')?.textContent).toBe('ICT101 Database Systems');
    expect(container.textContent).not.toContain('What would you like to study?');
  });

  it('removes a chat from History', async () => {
    studyAgentApi.sessions.mockResolvedValue({ data: { items: [{ ...subjectSession, id: 's9', title: 'To remove' }] } });
    studyAgentApi.archiveSession.mockResolvedValue({ data: { archived: true } });
    await renderWorkspace();
    await click(buttonWithText('History'));
    await flush();
    await click(container.querySelector('.study-agent__remove'));
    await flush();
    expect(studyAgentApi.archiveSession).toHaveBeenCalledWith('s9');
    expect(container.textContent).not.toContain('To remove');
  });

  it('starts a fresh chat from New chat', async () => {
    studyAgentApi.sessions.mockResolvedValue({ data: { items: [subjectSession] } });
    studyAgentApi.session.mockResolvedValue({
      data: { session: subjectSession, hasMore: false, messages: [{ id: 'm1', role: 'student', content: 'Old question', sources: [] }] },
    });
    await renderWorkspace();
    await click(buttonWithText('History'));
    await flush();
    await click(container.querySelector('.study-agent__history .study-agent__row'));
    await flush();
    expect(container.textContent).toContain('Old question');

    await click(buttonWithText('New chat'));
    await flush();
    expect(container.textContent).not.toContain('Old question');
    expect(container.textContent).toContain('What would you like to study?');
  });
});
