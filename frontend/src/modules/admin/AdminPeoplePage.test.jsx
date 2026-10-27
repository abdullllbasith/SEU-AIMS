import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AdminPeoplePage } from './AdminPeoplePage.jsx';

vi.mock('./admin-api.js', () => ({
  adminApi: {
    students: vi.fn(),
    lecturers: vi.fn(),
  },
}));

vi.mock('./academic-api.js', () => ({
  academicApi: {
    batches: vi.fn(),
  },
}));

import { adminApi } from './admin-api.js';
import { academicApi } from './academic-api.js';

describe('AdminPeoplePage', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    academicApi.batches.mockResolvedValue({
      data: { items: [{ id: 'batch-21', code: '21ICT', name: '21 ICT' }] },
    });
    adminApi.students.mockResolvedValue({
      data: {
        page: 1,
        pageSize: 20,
        total: 1,
        items: [
          {
            userId: 's1',
            registrationNumber: '21ICT001',
            displayName: 'Student One',
            accountStatus: 'ACTIVE',
            unresolvedEcaCount: 0,
          },
        ],
      },
    });
    adminApi.lecturers.mockResolvedValue({ data: { items: [], total: 0, page: 1, pageSize: 20 } });
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it('filters students by the selected batch', async () => {
    await act(async () => {
      root.render(createElement(MemoryRouter, null, createElement(AdminPeoplePage)));
    });
    await act(async () => {});
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    const batch = container.querySelector('select');
    expect(batch).toBeTruthy();
    expect(container.textContent).toContain('21ICT');
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    await act(async () => {
      setValue.call(batch, 'batch-21');
      batch.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    expect(adminApi.students).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'batch-21' }));
  });
});
