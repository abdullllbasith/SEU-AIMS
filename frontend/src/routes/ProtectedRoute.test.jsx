import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { AuthContext } from '../state/AuthProvider.jsx';
import { ROLES } from '../constants/roles.js';

describe('ProtectedRoute', () => {
  it('renders the loading state while auth is resolving', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          AuthContext.Provider,
          { value: { status: 'resolving', user: null } },
          createElement(MemoryRouter, null, createElement(ProtectedRoute, null, 'secret')),
        ),
      );
    });
    expect(container.textContent).toContain('Loading session');
    root.unmount();
    container.remove();
  });

  it('sends lecturers away from student-only Study Room routes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          AuthContext.Provider,
          { value: { status: 'authenticated', user: { role: ROLES.LECTURER } } },
          createElement(
            MemoryRouter,
            { initialEntries: ['/study-room'] },
            createElement(ProtectedRoute, { roles: [ROLES.STUDENT] }, 'study-room-secret'),
          ),
        ),
      );
    });
    expect(container.textContent).not.toContain('study-room-secret');
    root.unmount();
    container.remove();
  });
});
