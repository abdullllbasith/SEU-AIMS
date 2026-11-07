import { createElement, act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { AgentChat } from './AgentChat.jsx';
import { MAX_POLLS, POLL_INTERVAL_MS } from './useAttachments.js';

vi.mock('./study-agent-api.js', () => ({
  studyAgentApi: {
    session: vi.fn(),
    createSession: vi.fn(),
    sendMessage: vi.fn(),
    uploadAttachments: vi.fn(),
    attachmentStatus: vi.fn(),
    removeAttachment: vi.fn(),
    attachmentContentUrl: (id) => `/api/study-agent/attachments/${id}/content`,
  },
}));

import { studyAgentApi } from './study-agent-api.js';

const session = { id: 's1', mode: 'SUBJECT', subjectCode: 'ICT101', subjectName: 'Database Systems', title: 'Joins', messageCount: 2 };
const freeSession = { ...session, mode: 'FREE', subjectCode: '', subjectName: '' };
const earlier = [
  { id: 'm1', role: 'student', content: 'What is a join?', sources: [], attachments: [] },
  {
    id: 'm2',
    role: 'agent',
    content: 'A join combines rows.',
    sources: [{ kind: 'AI_KNOWLEDGE', title: 'General AI knowledge' }],
    attachments: [],
  },
];

const png = (name = 'q.png') => new File([new Uint8Array(20)], name, { type: 'image/png' });

function reply(content, extra = {}) {
  return {
    data: {
      userMessage: { id: 'u2', role: 'student', content, sources: [], attachments: [], ...extra.user },
      agentMessage: { id: 'a2', role: 'agent', content: 'Answer.', sources: [], ...extra.agent },
      indexing: { pendingDocuments: 0 },
    },
  };
}

describe('Study Agent attachments and quick actions', () => {
  let container;
  let root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    studyAgentApi.session.mockResolvedValue({ data: { session, messages: earlier, hasMore: false } });
    studyAgentApi.removeAttachment.mockResolvedValue({ data: { removed: true } });
    studyAgentApi.createSession.mockResolvedValue({ data: { ...session, mode: 'AUTO' } });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  async function settle(ms = 0) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  async function renderChat(theSession = session) {
    await act(async () => {
      root.render(createElement(AgentChat, { session: theSession, onNewChat: () => {}, onOpenSession: () => {} }));
    });
    await settle();
  }

  async function chooseFiles(files) {
    const input = container.querySelector('[data-testid="study-agent-file-input"]');
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
  }

  const sendButton = () => container.querySelector('.study-agent__composer button[type="submit"]');
  const buttonWithText = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
  const buttonByLabel = (label) => [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label);

  async function type(text) {
    const textarea = container.querySelector('#study-agent-input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, text);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('uploads a photo, shows progress and scanning, enables Send only when ready, then sends its id', async () => {
    studyAgentApi.uploadAttachments.mockImplementation(async (_id, _form, onProgress) => {
      onProgress(0.5);
      return { data: { items: [{ id: 'f1', name: 'q.png', mimeType: 'image/png', status: 'SCANNING' }] } };
    });
    studyAgentApi.attachmentStatus.mockResolvedValue({ data: { status: 'READY' } });
    studyAgentApi.sendMessage.mockResolvedValue(
      reply('Solve it', {
        user: { attachments: [{ id: 'f1', name: 'q.png', mimeType: 'image/png' }] },
        agent: { content: 'Step 1.', sources: [{ kind: 'UPLOAD', title: 'q.png', fileId: 'f1' }] },
      }),
    );
    await renderChat();
    await chooseFiles([png()]);

    expect(studyAgentApi.uploadAttachments).toHaveBeenCalledTimes(1);
    expect(studyAgentApi.uploadAttachments.mock.calls[0][1].getAll('files')).toHaveLength(1);
    expect(container.querySelector('.study-agent__thumb')?.getAttribute('src')).toBe('blob:preview');
    expect(container.textContent).toContain('Checking file');
    expect(sendButton().disabled).toBe(true);

    await settle(POLL_INTERVAL_MS + 10);
    expect(container.textContent).toContain('Ready');
    expect(sendButton().disabled).toBe(false);

    await type('Solve it');
    await act(async () => {
      sendButton().click();
    });
    await settle();

    expect(studyAgentApi.sendMessage).toHaveBeenCalledWith('s1', { content: 'Solve it', attachmentIds: ['f1'] });
    expect(container.querySelector('.study-agent__tray')).toBeNull();
    expect(container.querySelector('.study-agent__sent-image')?.getAttribute('src')).toBe(
      '/api/study-agent/attachments/f1/content',
    );
    expect(container.textContent).toContain('Your upload');
  });

  it('allows sending a photo with no typed text', async () => {
    studyAgentApi.uploadAttachments.mockResolvedValue({
      data: { items: [{ id: 'f1', name: 'q.png', mimeType: 'image/png', status: 'READY' }] },
    });
    studyAgentApi.sendMessage.mockResolvedValue(reply('Please read the attached material.'));
    await renderChat();
    await chooseFiles([png()]);
    expect(sendButton().disabled).toBe(false);
    await act(async () => {
      sendButton().click();
    });
    await settle();
    expect(studyAgentApi.sendMessage).toHaveBeenCalledWith('s1', { content: '', attachmentIds: ['f1'] });
  });

  it('refuses unsupported files without uploading and explains why', async () => {
    await renderChat();
    await chooseFiles([new File(['PK'], 'essay.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })]);
    expect(studyAgentApi.uploadAttachments).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'essay.docx is not an image, PDF or text file.',
    );
    expect(container.querySelector('.study-agent__tray')).toBeNull();
  });

  it('uploads a Markdown note as plain text', async () => {
    studyAgentApi.uploadAttachments.mockResolvedValue({
      data: { items: [{ id: 'f5', name: 'notes.md', mimeType: 'text/plain', status: 'READY' }] },
    });
    await renderChat();
    await chooseFiles([new File(['# Notes'], 'notes.md', { type: '' })]);
    const sent = studyAgentApi.uploadAttachments.mock.calls[0][1].get('files');
    expect(sent.type).toBe('text/plain');
    expect(sent.name).toBe('notes.md');
    expect(container.textContent).toContain('notes.md');
  });

  it('turns pasted text that would not fit in the box into a text attachment', async () => {
    studyAgentApi.uploadAttachments.mockResolvedValue({
      data: { items: [{ id: 'f6', name: 'pasted-text.txt', mimeType: 'text/plain', status: 'READY' }] },
    });
    await renderChat();
    const textarea = container.querySelector('#study-agent-input');
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { files: [], getData: () => 'x'.repeat(5000) },
    });
    await act(async () => {
      textarea.dispatchEvent(paste);
    });
    await settle();
    expect(paste.defaultPrevented).toBe(true);
    expect(studyAgentApi.uploadAttachments.mock.calls[0][1].get('files').name).toBe('pasted-text.txt');
    expect(container.textContent).toContain('pasted-text.txt');
  });

  it('creates the session when a file is attached to a brand new chat', async () => {
    studyAgentApi.createSession.mockResolvedValue({ data: { ...session, id: 'new1', mode: 'AUTO' } });
    studyAgentApi.uploadAttachments.mockResolvedValue({
      data: { items: [{ id: 'f7', name: 'q.png', mimeType: 'image/png', status: 'READY' }] },
    });
    await renderChat(null);
    await chooseFiles([png()]);
    expect(studyAgentApi.createSession).toHaveBeenCalledWith({ mode: 'AUTO' });
    expect(studyAgentApi.uploadAttachments.mock.calls[0][0]).toBe('new1');
  });

  it('attaches an image pasted from the clipboard but leaves plain text paste alone', async () => {
    studyAgentApi.uploadAttachments.mockResolvedValue({
      data: { items: [{ id: 'f9', name: 'image.png', mimeType: 'image/png', status: 'SCANNING' }] },
    });
    await renderChat();
    const textarea = container.querySelector('#study-agent-input');

    const textPaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(textPaste, 'clipboardData', { value: { files: [] } });
    await act(async () => {
      textarea.dispatchEvent(textPaste);
    });
    expect(textPaste.defaultPrevented).toBe(false);
    expect(studyAgentApi.uploadAttachments).not.toHaveBeenCalled();

    const imagePaste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(imagePaste, 'clipboardData', { value: { files: [png('image.png')] } });
    await act(async () => {
      textarea.dispatchEvent(imagePaste);
    });
    await settle();
    expect(imagePaste.defaultPrevented).toBe(true);
    expect(studyAgentApi.uploadAttachments).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('image.png');
  });

  it('accepts files dropped onto the chat', async () => {
    studyAgentApi.uploadAttachments.mockResolvedValue({
      data: { items: [{ id: 'f2', name: 'dropped.png', mimeType: 'image/png', status: 'SCANNING' }] },
    });
    await renderChat();
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [png('dropped.png')] } });
    await act(async () => {
      container.querySelector('.study-agent__chat').dispatchEvent(drop);
    });
    await settle();
    expect(studyAgentApi.uploadAttachments).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('dropped.png');
  });

  it('removes an attachment from the tray and withdraws it on the server', async () => {
    studyAgentApi.uploadAttachments.mockResolvedValue({
      data: { items: [{ id: 'f1', name: 'q.png', mimeType: 'image/png', status: 'READY' }] },
    });
    await renderChat();
    await chooseFiles([png()]);
    await act(async () => {
      container.querySelector('.study-agent__chip-remove').click();
    });
    expect(studyAgentApi.removeAttachment).toHaveBeenCalledWith('f1');
    expect(container.querySelector('.study-agent__tray')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('blocks Send while an upload failed and explains how to continue', async () => {
    studyAgentApi.uploadAttachments.mockRejectedValue(Object.assign(new Error('Upload failed'), { status: 415 }));
    await renderChat();
    await chooseFiles([png()]);
    await type('Solve this');
    expect(container.textContent).toContain('Upload failed');
    expect(container.textContent).toContain('Remove the files that could not be used before sending.');
    expect(sendButton().disabled).toBe(true);
    await act(async () => {
      container.querySelector('.study-agent__chip-remove').click();
    });
    expect(sendButton().disabled).toBe(false);
  });

  it('gives up on a file that never finishes scanning', async () => {
    studyAgentApi.uploadAttachments.mockResolvedValue({
      data: { items: [{ id: 'f1', name: 'q.png', mimeType: 'image/png', status: 'SCANNING' }] },
    });
    studyAgentApi.attachmentStatus.mockResolvedValue({ data: { status: 'SCANNING' } });
    await renderChat();
    await chooseFiles([png()]);
    for (let i = 0; i < MAX_POLLS + 1; i += 1) {
      await settle(POLL_INTERVAL_MS + 10);
    }
    expect(container.textContent).toContain('Cannot be used');
    expect(container.textContent).toContain('could not be verified in time');
    expect(sendButton().disabled).toBe(true);
  });

  it('sends a quick action with its intent and leaves the draft alone', async () => {
    studyAgentApi.sendMessage.mockResolvedValue(reply('Explain that more simply.'));
    await renderChat();
    await type('half-written thought');
    await act(async () => {
      buttonWithText('Simpler').click();
    });
    await settle();
    expect(studyAgentApi.sendMessage).toHaveBeenCalledWith('s1', {
      content: 'Explain that more simply.',
      intent: 'simpler',
    });
    expect(container.querySelector('#study-agent-input').value).toBe('half-written thought');
  });

  it('offers follow-up quick actions only once the tutor has answered', async () => {
    studyAgentApi.session.mockResolvedValue({ data: { session, messages: [], hasMore: false } });
    await renderChat();
    expect(buttonWithText('Simpler')).toBeUndefined();
    expect(buttonWithText('In Tamil')).toBeUndefined();
    expect(buttonByLabel('Search the web').disabled).toBe(false);
  });

  it('turns on research for the next message only', async () => {
    studyAgentApi.sendMessage.mockResolvedValue(reply('Latest SQL changes'));
    await renderChat();
    await act(async () => {
      buttonByLabel('Search the web').click();
    });
    expect(buttonByLabel('Search the web').getAttribute('aria-pressed')).toBe('true');
    await type('Latest SQL changes');
    await act(async () => {
      sendButton().click();
    });
    await settle();
    expect(studyAgentApi.sendMessage).toHaveBeenCalledWith('s1', { content: 'Latest SQL changes', intent: 'research' });
    expect(buttonByLabel('Search the web').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows no subject label for a free-study session', async () => {
    studyAgentApi.session.mockResolvedValue({ data: { session: freeSession, messages: [], hasMore: false } });
    await renderChat(freeSession);
    expect(container.querySelector('.study-agent__chat-subject')).toBeNull();
  });

  it('links only https web sources, safely, and labels them as web', async () => {
    studyAgentApi.session.mockResolvedValue({
      data: {
        session,
        hasMore: false,
        messages: [
          { id: 'm1', role: 'student', content: 'q', sources: [], attachments: [] },
          {
            id: 'm2',
            role: 'agent',
            content: 'Answer.',
            attachments: [],
            sources: [
              { kind: 'WEB', title: 'Safe page', url: 'https://example.org/a' },
              { kind: 'WEB', title: 'Plain http', url: 'http://example.org/b' },
              { kind: 'WEB', title: 'Script', url: 'javascript:alert(1)' },
            ],
          },
        ],
      },
    });
    await renderChat();
    const links = [...container.querySelectorAll('a.study-agent__source-title')];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://example.org/a');
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(container.textContent).toContain('Plain http');
    expect(container.textContent).toContain('Script');
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(container.querySelectorAll('.study-agent__source-kind--web')).toHaveLength(3);
  });
});
