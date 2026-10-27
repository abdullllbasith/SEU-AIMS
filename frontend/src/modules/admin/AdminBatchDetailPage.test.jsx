import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AdminBatchDetailPage } from './AdminBatchDetailPage.jsx';

vi.mock('./academic-api.js', () => ({
  academicApi: {
    batch: vi.fn(),
    years: vi.fn(),
    semesters: vi.fn(),
    offeringPreview: vi.fn(),
    progressionPreview: vi.fn(),
    progressBatch: vi.fn(),
    generateOfferings: vi.fn(),
    offerings: vi.fn(),
    subjects: vi.fn(),
    updateBatch: vi.fn(),
  },
}));

const { academicApi } = await import('./academic-api.js');

async function renderPage() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/admin/academic/batches/batch-1'] },
        createElement(
          Routes,
          null,
          createElement(Route, {
            path: '/admin/academic/batches/:batchId',
            element: createElement(AdminBatchDetailPage),
          }),
        ),
      ),
    );
  });
  return { container, root };
}

describe('AdminBatchDetailPage progression', () => {
  it('shows the next semester and keeps progression disabled at the final period', async () => {
    academicApi.batch.mockResolvedValue({
      data: {
        id: 'batch-1',
        code: '22ICT',
        name: '22 ICT',
        status: 'ACTIVE',
        academicContextVerifiedAt: '2026-01-01T00:00:00.000Z',
        currentAcademicYearName: 'Year 4',
        currentSemesterName: 'Semester 2',
        studentCount: 3,
      },
    });
    academicApi.years.mockResolvedValue({ data: { items: [] } });
    academicApi.semesters.mockResolvedValue({ data: { items: [] } });
    academicApi.offeringPreview.mockResolvedValue({ data: { subjects: [], skipped: [] } });
    academicApi.offerings.mockResolvedValue({ data: { items: [] } });
    academicApi.subjects.mockResolvedValue({ data: { items: [] } });
    academicApi.progressionPreview.mockResolvedValue({
      data: {
        canProgress: false,
        reason: 'This batch is in Year 4, Semester 2. Further progression is not available.',
        next: null,
        activeStudentsToAdvance: 3,
      },
    });

    const { container, root } = await renderPage();
    expect(container.textContent).toContain('Year 4, Semester 2');
    const button = [...container.querySelectorAll('button')].find((item) =>
      item.textContent.includes('Progress to next semester'),
    );
    expect(button?.disabled).toBe(true);
    expect(academicApi.progressBatch).not.toHaveBeenCalled();
    root.unmount();
    container.remove();
  });
});
