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
    claimIdentity: vi.fn(),
    folders: vi.fn(),
    messages: vi.fn(),
    attention: vi.fn(),
    markRead: vi.fn(),
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
  readStoredIdentity: vi.fn(async () => null),
  persistIdentity: vi.fn(),
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
    studyRoomApi.claimIdentity.mockResolvedValue({ data: {} });
    studyRoomApi.putPublicKey.mockResolvedValue({ data: {} });
    studyRoomApi.folders.mockResolvedValue({ data: { items: [] } });
    studyRoomApi.messages.mockResolvedValue({ data: { items: [] } });
    studyRoomApi.attention.mockResolvedValue({
      data: { common: 2, private: 1, resources: 4, total: 7 },
    });
    studyRoomApi.markRead.mockResolvedValue({ data: {} });

    await renderPage();
    await act(async () => {});
    await act(async () => {});

    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
    expect(container.textContent).toContain('Common chat');
    expect(container.textContent).toContain('Private chats');
    expect(container.textContent).toContain('Shared resources');
    expect(container.querySelector('[aria-label="2 new common chat messages"]')?.textContent).toBe('2');
    expect(container.querySelector('[aria-label="1 new private chats"]')?.textContent).toBe('1');
    expect(container.querySelector('[aria-label="4 resource updates"]')?.textContent).toBe('4');
    expect(container.textContent).toContain('Common batch chat');
  });

  it('shows an unread count on a private chat and clears it when that chat is opened', async () => {
    studyRoomApi.access.mockResolvedValue({
      data: { allowed: true, commonConversation: { id: 'c1' } },
    });
    studyRoomApi.claimIdentity.mockResolvedValue({ data: {} });
    studyRoomApi.putPublicKey.mockResolvedValue({ data: {} });
    studyRoomApi.folders.mockResolvedValue({ data: { items: [] } });
    studyRoomApi.messages.mockResolvedValue({ data: { items: [] } });
    studyRoomApi.attention.mockResolvedValue({
      data: { common: 0, private: 2, resources: 0, total: 2 },
    });
    studyRoomApi.conversations = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 'p1',
            type: 'PRIVATE',
            peer: { id: 'peer', displayName: 'S P NAFLA', registrationNumber: '22ICT001' },
            lastMessageAt: '2026-10-27T01:53:00.000Z',
            unreadCount: 2,
          },
          {
            id: 'p2',
            type: 'PRIVATE',
            peer: { id: 'peer2', displayName: '21ICT067', registrationNumber: '21ICT067' },
            unreadCount: 0,
          },
        ],
      },
    });

    await renderPage();
    await act(async () => {});
    await act(async () => {});

    const privateTab = [...container.querySelectorAll('[role="tab"]')].find((node) =>
      node.textContent.includes('Private chats'),
    );
    await act(async () => {
      privateTab.click();
    });
    await act(async () => {});

    expect(container.querySelector('[aria-label="2 unread messages"]')?.textContent).toBe('2');
    const quiet = [...container.querySelectorAll('.inbox-row')].find((node) => node.textContent.includes('21ICT067'));
    expect(quiet?.querySelector('.update-badge')).toBeFalsy();

    const unread = [...container.querySelectorAll('.inbox-row')].find((node) => node.textContent.includes('S P NAFLA'));
    await act(async () => {
      unread.click();
    });
    expect(container.querySelector('[aria-label="2 unread messages"]')).toBeFalsy();
    expect(unread.classList.contains('is-active')).toBe(true);
  });

  it('opens shared resources as folders and creates a folder from an overlay', async () => {
    studyRoomApi.access.mockResolvedValue({
      data: { allowed: true, commonConversation: { id: 'c1' } },
    });
    studyRoomApi.claimIdentity.mockResolvedValue({ data: {} });
    studyRoomApi.putPublicKey.mockResolvedValue({ data: {} });
    studyRoomApi.folders.mockResolvedValue({
      data: { items: [{ id: 'f1', name: 'IAD Pract' }] },
    });
    studyRoomApi.messages.mockResolvedValue({ data: { items: [] } });
    studyRoomApi.attention.mockResolvedValue({
      data: { common: 0, private: 0, resources: 0, total: 0 },
    });
    studyRoomApi.folderResources = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 'r1',
            displayFilename: 'SWT 22022_Labsheet 1.pdf',
            mimeType: 'application/pdf',
            downloadable: true,
            studentStatusLabel: 'Available',
            createdByDisplayName: 'STUDENT_A',
            createdAt: '2026-10-10T10:34:39.000Z',
          },
        ],
      },
    });

    await renderPage();
    await act(async () => {});
    await act(async () => {});

    const filesTab = [...container.querySelectorAll('[role="tab"]')].find((node) =>
      node.textContent.includes('Shared resources'),
    );
    await act(async () => {
      filesTab.click();
    });

    expect(container.textContent).toContain('IAD Pract');
    expect(container.textContent).toContain('Create folder');
    expect(container.textContent).not.toContain('New folder name');
    expect(container.querySelector('.folder-tile')).toBeTruthy();

    const create = [...container.querySelectorAll('button')].find((node) => node.textContent === 'Create folder');
    await act(async () => {
      create.click();
    });
    expect(container.querySelector('#folder-dialog-title')?.textContent).toBe('Create folder');
    expect(container.textContent).toContain('Cancel');

    await act(async () => {
      container.querySelector('.folder-tile').click();
    });
    await act(async () => {});
    expect(container.textContent).toContain('SWT 22022_Labsheet 1.pdf');
    expect(container.querySelector('[aria-label="Download SWT 22022_Labsheet 1.pdf"]')).toBeTruthy();
    expect(container.querySelector('.tile-tip')).toBeFalsy();
    vi.useFakeTimers();
    await act(async () => {
      container.querySelector('.file-tile').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(container.querySelector('.tile-tip')).toBeFalsy();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(container.querySelector('.tile-tip')?.textContent).toContain('Uploaded by');
    expect(container.querySelector('.tile-tip')?.textContent).toContain('STUDENT_A');
    vi.useRealTimers();
    expect(container.textContent).toContain('Import');
    const fileMenu = container.querySelector('[aria-label="Actions for SWT 22022_Labsheet 1.pdf"]');
    await act(async () => {
      fileMenu.click();
    });
    expect(container.querySelector('.tile-menu')?.textContent).toContain('Rename');
    expect(container.querySelector('.tile-menu')?.textContent).toContain('Report');
    expect(container.querySelector('.tile-menu__danger')?.textContent).toBe('Delete');
  });
});
