import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { CatalogImportPanel } from './CatalogImportPanel.jsx';

vi.mock('./academic-api.js', () => ({
  academicApi: {
    catalogPreview: vi.fn(),
    catalogCommit: vi.fn(),
  },
}));

const { academicApi } = await import('./academic-api.js');

describe('CatalogImportPanel', () => {
  it('shows the preview report before import is available', async () => {
    academicApi.catalogPreview.mockResolvedValue({
      data: {
        subjects: { create: 96, unchanged: 0 },
        mappings: { create: 90, unchanged: 0, blocked: 0 },
        offeringsCreated: 0,
        conflicts: [{ code: 'NST32042', reasons: ['NAME_MISMATCH'], names: ['Information System Security', 'Information Systems security'] }],
        databaseConflicts: [],
        unstored: { note: 'Specialization and elective selection rules are reported and are not written.' },
      },
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(CatalogImportPanel));
    });
    const preview = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Preview catalog');
    await act(async () => {
      preview.click();
    });
    expect(container.textContent).toContain('Subjects to add: 96');
    expect(container.textContent).toContain('NST32042');
    expect(container.textContent).toContain('Offerings created: 0');
    expect(academicApi.catalogCommit).not.toHaveBeenCalled();
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
