import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AcademicAdminPage } from './AcademicAdminPage.jsx';

vi.mock('./academic-api.js', () => ({
  academicApi: {
    overview: vi.fn(),
    departments: vi.fn(),
    batches: vi.fn(),
    years: vi.fn(),
    semesters: vi.fn(),
    subjects: vi.fn(),
    curriculum: vi.fn(),
    offerings: vi.fn(),
    members: vi.fn(),
    assignments: vi.fn(),
    students: vi.fn(),
    catalogPreview: vi.fn(),
    catalogCommit: vi.fn(),
  },
}));

const { academicApi } = await import('./academic-api.js');

function page(items = []) {
  return { data: { items, total: items.length, page: 1, pageSize: 50 } };
}

describe('AcademicAdminPage curriculum subject labels', () => {
  it('shows the subject name returned on the mapping when that subject is outside the loaded subject page', async () => {
    academicApi.overview.mockResolvedValue({ data: { department: { id: 'dept-1', name: 'ICT' }, counts: {} } });
    academicApi.departments.mockResolvedValue({ data: { items: [{ id: 'dept-1', code: 'ICT', name: 'ICT' }] } });
    academicApi.batches.mockResolvedValue(page());
    academicApi.years.mockResolvedValue(page([{ id: 'year-4', name: 'Year 4', sequence: 4, status: 'ACTIVE' }]));
    academicApi.semesters.mockResolvedValue(
      page([{ id: 'sem-2', name: 'Semester 2', sequence: 2, academicYearId: 'year-4', status: 'ACTIVE' }]),
    );
    academicApi.subjects.mockResolvedValue(page([{ id: 'subject-early', code: 'CIS11012', name: 'Essentials of ICT', status: 'ACTIVE' }]));
    academicApi.curriculum.mockResolvedValue(
      page([
        {
          id: 'mapping-1',
          subjectId: '6aca7b88337ed90ca3142f04',
          subjectCode: 'SWT40016',
          subjectName: 'Individual Project',
          academicYearId: 'year-4',
          semesterId: 'sem-2',
          status: 'ACTIVE',
        },
      ]),
    );
    academicApi.offerings.mockResolvedValue(page());
    academicApi.members.mockResolvedValue(page());
    academicApi.assignments.mockResolvedValue(page());
    academicApi.students.mockResolvedValue(page());

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(AcademicAdminPage));
    });
    const curriculum = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Curriculum');
    await act(async () => {
      curriculum.click();
    });
    expect(container.textContent).toContain('SWT40016 — Individual Project');
    expect(container.textContent).not.toContain('6aca7b88337ed90ca3142f04');
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('loads every subject page into the mapping list and filters curriculum by year and semester', async () => {
    academicApi.overview.mockResolvedValue({ data: { department: { id: 'dept-1', name: 'ICT' }, counts: {} } });
    academicApi.departments.mockResolvedValue({ data: { items: [{ id: 'dept-1', code: 'ICT', name: 'ICT' }] } });
    academicApi.batches.mockResolvedValue(page());
    academicApi.years.mockResolvedValue(
      page([
        { id: 'year-1', name: 'Year 1', sequence: 1, status: 'ACTIVE' },
        { id: 'year-4', name: 'Year 4', sequence: 4, status: 'ACTIVE' },
      ]),
    );
    academicApi.semesters.mockResolvedValue(page());
    academicApi.subjects.mockImplementation(async (params = {}) => {
      if (Number(params.page) === 2) {
        return {
          data: {
            items: [{ id: 'subject-y1', code: 'CIS11012', name: 'Essentials of ICT and PC Applications', status: 'ACTIVE' }],
            total: 51,
            page: 2,
            pageSize: 50,
          },
        };
      }
      return {
        data: {
          items: [{ id: 'subject-y4', code: 'SWT40016', name: 'Final Research and Development Project', status: 'ACTIVE' }],
          total: 51,
          page: 1,
          pageSize: 50,
        },
      };
    });
    academicApi.curriculum.mockResolvedValue(page());
    academicApi.offerings.mockResolvedValue(page());
    academicApi.members.mockResolvedValue(page());
    academicApi.assignments.mockResolvedValue(page());
    academicApi.students.mockResolvedValue(page());

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(AcademicAdminPage));
    });
    const curriculum = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Curriculum');
    await act(async () => {
      curriculum.click();
    });
    expect(container.querySelector('select[name="subjectId"]').textContent).toContain('CIS11012 — Essentials of ICT and PC Applications');
    const yearButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Year 1');
    const semesterButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Semester 1');
    await act(async () => {
      yearButton.click();
    });
    await act(async () => {
      semesterButton.click();
    });
    expect(academicApi.curriculum).toHaveBeenCalledWith(
      expect.objectContaining({ academicYearId: 'year-1', semesterSequence: '1', page: 1 }),
    );
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
