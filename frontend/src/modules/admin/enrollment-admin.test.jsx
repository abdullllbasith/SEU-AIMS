import { createElement } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { OfferingEnrollmentRoster, StudentEnrollmentsPanel } from './enrollment-admin.jsx';

vi.mock('./academic-api.js', () => ({
  academicApi: {
    students: vi.fn(),
    offerings: vi.fn(),
    subjects: vi.fn(),
    years: vi.fn(),
    semesters: vi.fn(),
    studentEnrollments: vi.fn(),
    offeringEnrollments: vi.fn(),
    createOfferingEnrollment: vi.fn(),
    cancelEnrollment: vi.fn(),
  },
}));

const { academicApi } = await import('./academic-api.js');

const years = [{ id: 'year-1', name: 'Year 1', sequence: 1, status: 'ACTIVE' }];
const semesters = [{ id: 'sem-1', name: 'Semester 1', sequence: 1, academicYearId: 'year-1', status: 'ACTIVE' }];
const offering = {
  id: 'offering-1',
  subjectId: 'subject-1',
  subjectCode: 'ICT1233',
  subjectName: 'Synthetic Subject',
  batchId: 'batch-1',
  academicYearId: 'year-1',
  semesterId: 'sem-1',
  status: 'ACTIVE',
};

function enrollment(overrides = {}) {
  return {
    id: 'enrollment-1',
    registrationNumber: 'SEU/IS/22/ICT/001',
    subjectId: 'subject-1',
    subjectCode: 'ICT1233',
    subjectOfferingId: 'offering-1',
    enrollmentType: 'REPEAT',
    status: 'ACTIVE',
    originalAcademicYearId: 'year-1',
    originalSemesterId: 'sem-1',
    createdAt: '2026-03-01T00:00:00.000Z',
    cancelledAt: null,
    ...overrides,
  };
}

async function render(node) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return { container, root };
}

function setInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setSelect(select, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  academicApi.subjects.mockResolvedValue({ data: { items: [{ id: 'subject-1', code: 'ICT1233', name: 'Synthetic Subject' }] } });
  academicApi.years.mockResolvedValue({ data: { items: years } });
  academicApi.semesters.mockResolvedValue({ data: { items: semesters } });
  academicApi.offerings.mockResolvedValue({ data: { items: [offering] } });
});

describe('StudentEnrollmentsPanel', () => {
  it('renders an enrollment with subject, type, offering period, and original period', async () => {
    academicApi.students.mockResolvedValue({
      data: { items: [{ id: 'context-1', userId: 'user-1', registrationNumber: 'SEU/IS/22/ICT/001' }] },
    });
    academicApi.studentEnrollments.mockResolvedValue({ data: { items: [enrollment()] } });
    const { container, root } = await render(
      createElement(StudentEnrollmentsPanel, { userId: 'user-1', registrationNumber: 'SEU/IS/22/ICT/001' }),
    );
    expect(container.textContent).toContain('ICT1233');
    expect(container.textContent).toContain('Synthetic Subject');
    expect(container.textContent).toContain('REPEAT');
    expect(container.textContent).toContain('ACTIVE');
    expect(container.textContent).toContain('Year 1 · Semester 1');
    expect(academicApi.studentEnrollments).toHaveBeenCalledWith('context-1', { status: 'ALL', pageSize: 50 });
    root.unmount();
    container.remove();
  });

  it('shows loading, empty, and error states', async () => {
    let resolveStudents;
    academicApi.students.mockReturnValue(
      new Promise((resolve) => {
        resolveStudents = resolve;
      }),
    );
    academicApi.offerings.mockReturnValue(new Promise(() => {}));
    const loading = await render(
      createElement(StudentEnrollmentsPanel, { userId: 'user-1', registrationNumber: 'SEU/IS/22/ICT/001' }),
    );
    expect(loading.container.textContent).toContain('Loading enrollments…');
    loading.root.unmount();
    loading.container.remove();

    academicApi.students.mockResolvedValue({ data: { items: [] } });
    academicApi.offerings.mockResolvedValue({ data: { items: [] } });
    const empty = await render(
      createElement(StudentEnrollmentsPanel, { userId: 'user-1', registrationNumber: 'SEU/IS/22/ICT/009' }),
    );
    expect(empty.container.textContent).toContain('No academic membership was found');
    empty.root.unmount();
    empty.container.remove();

    academicApi.students.mockRejectedValue(new Error('Enrollment service unavailable'));
    const failed = await render(
      createElement(StudentEnrollmentsPanel, { userId: 'user-1', registrationNumber: 'SEU/IS/22/ICT/001' }),
    );
    expect(failed.container.textContent).toContain('Enrollment service unavailable');
    failed.root.unmount();
    failed.container.remove();
    resolveStudents?.({ data: { items: [] } });
  });
});

describe('OfferingEnrollmentRoster', () => {
  async function openOffering(container) {
    const select = container.querySelector('select[name="subjectOfferingId"]');
    await act(async () => {
      setSelect(select, 'offering-1');
    });
  }

  it('lists offering enrollments and shows an empty roster', async () => {
    academicApi.offeringEnrollments.mockResolvedValue({ data: { items: [] } });
    const { container, root } = await render(
      createElement(OfferingEnrollmentRoster, { batchId: 'batch-1', years, semesters }),
    );
    expect(container.textContent).toContain('ICT1233');
    await openOffering(container);
    expect(container.textContent).toContain('No repeat or arrear enrollments.');
    expect(academicApi.offeringEnrollments).toHaveBeenCalledWith('offering-1', { status: 'ALL', pageSize: 50 });
    root.unmount();
    container.remove();
  });

  it('creates REPEAT and ARREAR enrollments with the context id and type only', async () => {
    academicApi.offeringEnrollments.mockResolvedValue({ data: { items: [] } });
    academicApi.students.mockResolvedValue({
      data: { items: [{ id: 'context-1', registrationNumber: 'SEU/IS/22/ICT/001', userId: 'user-1' }] },
    });
    academicApi.createOfferingEnrollment.mockResolvedValue({ data: enrollment() });
    const { container, root } = await render(
      createElement(OfferingEnrollmentRoster, { batchId: 'batch-1', years, semesters }),
    );
    await openOffering(container);
    const registration = container.querySelector('input[name="registrationNumber"]');
    await act(async () => {
      setInput(registration, 'SEU/IS/22/ICT/001');
    });
    const search = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Find student');
    await act(async () => {
      search.click();
    });
    expect(academicApi.students).toHaveBeenCalledWith({
      q: 'SEU/IS/22/ICT/001',
      batchId: 'batch-1',
      status: 'ALL',
      pageSize: 20,
    });
    const enroll = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Enroll student');
    await act(async () => {
      enroll.click();
    });
    expect(academicApi.createOfferingEnrollment).toHaveBeenCalledWith('offering-1', {
      studentContextId: 'context-1',
      enrollmentType: 'REPEAT',
    });

    const type = container.querySelector('select[name="enrollmentType"]');
    await act(async () => {
      setSelect(type, 'ARREAR');
    });
    const enrollAgain = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Enroll student');
    await act(async () => {
      enrollAgain.click();
    });
    expect(academicApi.createOfferingEnrollment).toHaveBeenLastCalledWith('offering-1', {
      studentContextId: 'context-1',
      enrollmentType: 'ARREAR',
    });
    root.unmount();
    container.remove();
  });

  it('shows a duplicate enrollment error and does not treat it as success', async () => {
    academicApi.offeringEnrollments.mockResolvedValue({ data: { items: [enrollment()] } });
    academicApi.students.mockResolvedValue({
      data: { items: [{ id: 'context-1', registrationNumber: 'SEU/IS/22/ICT/001', userId: 'user-1' }] },
    });
    const duplicate = new Error('This student is already enrolled in the subject offering');
    duplicate.status = 409;
    academicApi.createOfferingEnrollment.mockRejectedValue(duplicate);
    const { container, root } = await render(
      createElement(OfferingEnrollmentRoster, { batchId: 'batch-1', years, semesters }),
    );
    await openOffering(container);
    await act(async () => {
      setInput(container.querySelector('input[name="registrationNumber"]'), 'SEU/IS/22/ICT/001');
    });
    await act(async () => {
      [...container.querySelectorAll('button')].find((item) => item.textContent === 'Find student').click();
    });
    await act(async () => {
      [...container.querySelectorAll('button')].find((item) => item.textContent === 'Enroll student').click();
    });
    expect(container.querySelector('[role="alert"]').textContent).toContain('already enrolled');
    expect(container.textContent).toContain('ACTIVE');
    root.unmount();
    container.remove();
  });

  it('cancels an active enrollment after confirmation', async () => {
    academicApi.offeringEnrollments
      .mockResolvedValueOnce({ data: { items: [enrollment()] } })
      .mockResolvedValueOnce({
        data: {
          items: [enrollment({ status: 'CANCELLED', cancelledAt: '2026-04-01T00:00:00.000Z' })],
        },
      });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    academicApi.cancelEnrollment.mockResolvedValue({
      data: enrollment({ status: 'CANCELLED', cancelledAt: '2026-04-01T00:00:00.000Z' }),
    });
    const { container, root } = await render(
      createElement(OfferingEnrollmentRoster, { batchId: 'batch-1', years, semesters }),
    );
    await openOffering(container);
    await act(async () => {
      [...container.querySelectorAll('button')].find((item) => item.textContent === 'Cancel').click();
    });
    expect(confirm).toHaveBeenCalled();
    expect(academicApi.cancelEnrollment).toHaveBeenCalledWith('enrollment-1');
    expect(container.textContent).toContain('CANCELLED');
    confirm.mockRestore();
    root.unmount();
    container.remove();
  });

  it('keeps the enrollment active when cancellation fails', async () => {
    academicApi.offeringEnrollments.mockResolvedValue({ data: { items: [enrollment()] } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    academicApi.cancelEnrollment.mockRejectedValue(new Error('Unable to cancel enrollment'));
    const { container, root } = await render(
      createElement(OfferingEnrollmentRoster, { batchId: 'batch-1', years, semesters }),
    );
    await openOffering(container);
    await act(async () => {
      [...container.querySelectorAll('button')].find((item) => item.textContent === 'Cancel').click();
    });
    expect(container.querySelector('[role="alert"]').textContent).toContain('Unable to cancel enrollment');
    expect(container.textContent).toContain('ACTIVE');
    expect(container.textContent).not.toContain('CANCELLED');
    confirm.mockRestore();
    root.unmount();
    container.remove();
  });
});
