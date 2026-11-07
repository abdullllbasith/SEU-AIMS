import { createElement, act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { ChangePasswordPanel } from './ChangePasswordPanel.jsx';

const logout = vi.fn();

vi.mock('../../state/AuthProvider.jsx', () => ({ useAuth: () => ({ logout }) }));
vi.mock('../../services/api-client.js', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from '../../services/api-client.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ChangePasswordPanel', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    act(() => root.render(createElement(ChangePasswordPanel)));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function fillAndSubmit(current, next, confirm) {
    await act(async () => {
      setValue(container.querySelector('[name="currentPassword"]'), current);
      setValue(container.querySelector('[name="nextPassword"]'), next);
      setValue(container.querySelector('[name="confirmPassword"]'), confirm);
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  }

  it('rejects mismatched confirmation without calling the API', async () => {
    await fillAndSubmit('old-password-1', 'new-password-123', 'different-123456');
    expect(container.querySelector('[role="alert"]').textContent).toContain('do not match');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('changes the password then signs out', async () => {
    apiRequest.mockResolvedValue({ data: { passwordChanged: true } });
    await fillAndSubmit('old-password-1', 'new-password-123', 'new-password-123');
    expect(apiRequest).toHaveBeenCalledWith('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'old-password-1', nextPassword: 'new-password-123' }),
    });
    expect(logout).toHaveBeenCalled();
  });

  it('shows a clear message for a wrong current password', async () => {
    apiRequest.mockRejectedValue(new Error('Invalid credentials'));
    await fillAndSubmit('wrong-password-1', 'new-password-123', 'new-password-123');
    expect(container.querySelector('[role="alert"]').textContent).toBe('Current password is incorrect');
    expect(logout).not.toHaveBeenCalled();
  });
});
