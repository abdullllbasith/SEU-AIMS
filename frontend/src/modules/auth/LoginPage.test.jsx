import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { LoginPage } from './LoginPage.jsx';
import { AuthContext } from '../../state/AuthProvider.jsx';

describe('LoginPage', () => {
  it('exposes labeled email and password fields and an accessible error region', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          AuthContext.Provider,
          { value: { status: 'unauthenticated', user: null, login: async () => {} } },
          createElement(MemoryRouter, null, createElement(LoginPage)),
        ),
      );
    });
    expect(container.querySelector('h1')?.textContent).toBe('Sign in');
    expect(container.querySelector('label input[type="email"]')).toBeTruthy();
    expect(container.querySelector('label input[type="password"]')).toBeTruthy();
    expect(container.querySelector('button[type="submit"]')).toBeTruthy();
    root.unmount();
    container.remove();
  });
});
