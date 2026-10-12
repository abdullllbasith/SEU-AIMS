import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { StudyRoomPage } from './StudyRoomPage.jsx';
import { AuthContext } from '../../state/AuthProvider.jsx';

vi.mock('./study-room-api.js', () => ({
  studyRoomApi: {
    access: vi.fn(),
    putPublicKey: vi.fn(),
    folders: vi.fn(),
    messages: vi.fn(),
    downloadUrl: (id) => `/api/study-room/resources/${id}/download`,
  },
}));

vi.mock('./socket-client.js', () => ({
  connectStudyRoomSocket: () => ({
    on: () => {},
    emit: () => {},
    disconnect: () => {},
  }),
}));

vi.mock('./key-store.js', () => ({
  loadOrCreateIdentity: vi.fn(async () => ({
    privateKey: {},
    publicKey: {},
    publicJwk: { kty: 'OKP' },
    keyVersion: '1',
  })),
}));

vi.mock('./encryption.js', () => ({
  decryptPayload: vi.fn(),
  derivePrivateConversationKey: vi.fn(),
  encryptPlaintext: vi.fn(),
  exportPrivateJwk: vi.fn(),
  exportPublicJwk: vi.fn(),
  generateGroupKey: vi.fn(),
  generateIdentityKeyPair: vi.fn(),
  importPrivateJwk: vi.fn(),
  importPublicJwk: vi.fn(),
  exportRawKey: vi.fn(),
  unwrapGroupKey: vi.fn(),
  wrapGroupKey: vi.fn(),
}));

import { studyRoomApi } from './study-room-api.js';

describe('StudyRoomPage', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  async function renderPage() {
    await act(async () => {
      root.render(
        createElement(
          AuthContext.Provider,
          {
            value: {
              status: 'authenticated',
              user: { id: 's1', role: 'STUDENT', email: 'student@example.com' },
            },
          },
          createElement(MemoryRouter, null, createElement(StudyRoomPage)),
        ),
      );
    });
  }

  it('shows loading header while opening Study Room', async () => {
    studyRoomApi.access.mockReturnValue(new Promise(() => {}));
    await renderPage();
    expect(container.querySelector('h1')?.textContent).toBe('Study Room');
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(container.querySelector('.skeleton-block')).toBeTruthy();
  });

  it('explains unavailable access for students without academic context', async () => {
    studyRoomApi.access.mockResolvedValue({ data: { allowed: false } });
    await renderPage();
    await act(async () => {});
    expect(container.textContent).toContain(
      'Study Room is available only to students with an active academic context',
    );
  });

  it('renders workspace tabs when Study Room is ready', async () => {
    studyRoomApi.access.mockResolvedValue({
      data: {
        allowed: true,
        commonConversation: { id: 'c1' },
      },
    });
    studyRoomApi.putPublicKey.mockResolvedValue({ data: {} });
    studyRoomApi.folders.mockResolvedValue({ data: { items: [] } });
    studyRoomApi.messages.mockResolvedValue({ data: { items: [] } });

    await renderPage();
    await act(async () => {});
    await act(async () => {});

    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
    expect(container.textContent).toContain('Common chat');
    expect(container.textContent).toContain('Private chats');
    expect(container.textContent).toContain('Shared resources');
    expect(container.textContent).toContain('Common batch chat');
  });
});
