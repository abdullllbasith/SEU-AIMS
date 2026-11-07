import { createElement, act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { AdminAdministratorsPage } from './AdminAdministratorsPage.jsx';

vi.mock('./admin-api.js', () => ({
  adminApi: {
    admins: vi.fn(),
    createAdmin: vi.fn(),
    setAdminStatus: vi.fn(),
    resetAdminPassword: vi.fn(),
  },
}));

import { adminApi } from './admin-api.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

describe('AdminAdministratorsPage', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    adminApi.admins.mockResolvedValue({
      data: {
        items: [
          { id: 'me', email: 'me@seu.ac.lk', displayName: 'Me', accountStatus: 'ACTIVE', isSelf: true },
          { id: 'peer', email: 'peer@seu.ac.lk', displayName: 'Peer', accountStatus: 'ACTIVE', isSelf: false },
        ],
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function render() {
    await act(async () => {
      root.render(createElement(MemoryRouter, null, createElement(AdminAdministratorsPage)));
    });
    await flush();
  }

  it('hides reset and suspend actions for the signed-in admin', async () => {
    await render();
    const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent);
    expect(buttons.filter((t) => t === 'Reset password')).toHaveLength(1);
    expect(buttons.filter((t) => t === 'Suspend')).toHaveLength(1);
    expect(container.textContent).toContain('Use Profile to change your own password.');
  });

  it('shows the temporary password once after a reset and clears it on dismiss', async () => {
    adminApi.resetAdminPassword.mockResolvedValue({ data: { temporaryPassword: 'Temp-Pass-12345678' } });
    await render();
    const reset = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Reset password');
    await act(async () => reset.click());
    await flush();
    expect(adminApi.resetAdminPassword).toHaveBeenCalledWith('peer');
    expect(container.querySelector('[data-testid="temporary-password"]').textContent).toBe('Temp-Pass-12345678');

    const dismiss = [...container.querySelectorAll('button')].find((b) => b.textContent === 'I have saved it');
    await act(async () => dismiss.click());
    expect(container.querySelector('[data-testid="temporary-password"]')).toBeNull();
  });

  it('does nothing when the confirmation is declined', async () => {
    window.confirm.mockReturnValue(false);
    await render();
    const suspend = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Suspend');
    await act(async () => suspend.click());
    expect(adminApi.setAdminStatus).not.toHaveBeenCalled();
  });
});
