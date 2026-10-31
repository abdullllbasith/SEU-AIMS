import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LecturerCaPage } from './LecturerCaPage.jsx';

vi.mock('./ca-api.js', () => ({
  caApi: {
    lecturerEligible: vi.fn(),
    examNotices: vi.fn(),
    recoveryResults: vi.fn(),
    publishExamNotice: vi.fn(),
    rescheduleExamNotice: vi.fn(),
    cancelExamNotice: vi.fn(),
    attachToExamNotice: vi.fn(),
    examNoticeDelivery: vi.fn(),
    completeSubject: vi.fn(),
    decideRecovery: vi.fn(),
  },
}));

const { caApi } = await import('./ca-api.js');

const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
const setSelect = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;

const eligible = [
  {
    linkId: 'l-a',
    applicationId: 'CA-1',
    registrationNumber: 'SEU/IS/22/ICT/001',
    workflowStatus: 'SCHEDULED',
    examStatus: 'READY_TO_SCHEDULE',
    subjectOfferingId: 'off-a',
    subjectCode: 'ICT1001',
    subjectName: 'Subject A',
    incompleteCaId: 'c-a',
  },
  {
    linkId: 'l-b',
    applicationId: 'CA-1',
    registrationNumber: 'SEU/IS/22/ICT/001',
    workflowStatus: 'SCHEDULED',
    examStatus: 'SCHEDULED',
    subjectOfferingId: 'off-b',
    subjectCode: 'ICT1002',
    subjectName: 'Subject B',
    incompleteCaId: 'c-b',
  },
];

const notice = {
  id: 'n-b',
  subjectOfferingId: 'off-b',
  subjectCode: 'ICT1002',
  subjectName: 'Subject B',
  localDate: 'Tue, 10 Nov 2026',
  localTime: '09:00',
  venue: 'Main Hall',
  studentCount: 2,
  status: 'PUBLISHED',
  generation: 1,
  history: [],
};

function find(container, text, tag = 'button') {
  return [...container.querySelectorAll(tag)].find((item) => item.textContent === text);
}

async function type(container, label, value) {
  const input = container.querySelector(`input[aria-label="${label}"]`);
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(LecturerCaPage)));
  });
  return { container, root };
}

describe('LecturerCaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    caApi.lecturerEligible.mockResolvedValue({ data: { items: eligible } });
    caApi.examNotices.mockResolvedValue({ data: { items: [notice] } });
    caApi.recoveryResults.mockResolvedValue({ data: { items: [] } });
  });

  it('groups approved students by subject and offers only subjects without a published notice', async () => {
    const { container, root } = await mount();
    expect(container.textContent).toContain('ICT1001 Subject A');
    expect(container.textContent).toContain('ICT1002 Subject B');
    const select = container.querySelector('select[aria-label="Subject"]');
    const options = [...select.options].map((option) => option.textContent);
    expect(options).toContain('ICT1001 Subject A');
    expect(options).not.toContain('ICT1002 Subject B');
    expect(container.textContent).toContain('Main Hall');
    expect(container.textContent).toContain('09:00 (Asia/Colombo)');
    root.unmount();
  });

  it('publishes a notice with subject, date, time and venue (no prompt dialogs)', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    caApi.publishExamNotice.mockResolvedValue({ data: {} });
    const { container, root } = await mount();
    const select = container.querySelector('select[aria-label="Subject"]');
    await act(async () => {
      setSelect.call(select, 'off-a');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await type(container, 'Date', '2026-11-10');
    await type(container, 'Start time', '09:30');
    await type(container, 'End time', '11:30');
    await type(container, 'Venue', 'Lab 2');
    await act(async () => {
      find(container, 'Publish notice').click();
    });
    expect(caApi.publishExamNotice).toHaveBeenCalledWith({
      subjectOfferingId: 'off-a',
      date: '2026-11-10',
      startTime: '09:30',
      endTime: '11:30',
      venue: 'Lab 2',
    });
    expect(container.textContent).toContain('Examination notice published');
    expect(prompt).not.toHaveBeenCalled();
    root.unmount();
  });

  it('shows the server error and keeps the form when publishing fails', async () => {
    caApi.publishExamNotice.mockRejectedValue(new Error('The examination must be scheduled for a future date and time'));
    const { container, root } = await mount();
    const select = container.querySelector('select[aria-label="Subject"]');
    await act(async () => {
      setSelect.call(select, 'off-a');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await type(container, 'Venue', 'Lab 2');
    await act(async () => {
      find(container, 'Publish notice').click();
    });
    expect(container.querySelector('[role="alert"]').textContent).toContain('future date');
    expect(container.querySelector('input[aria-label="Venue"]').value).toBe('Lab 2');
    root.unmount();
  });

  it('reschedules a notice with new date and time', async () => {
    caApi.rescheduleExamNotice.mockResolvedValue({ data: {} });
    const { container, root } = await mount();
    await act(async () => {
      find(container, 'Reschedule').click();
    });
    const editDate = [...container.querySelectorAll('input[aria-label="Date"]')].at(-1);
    await act(async () => {
      setValue.call(editDate, '2026-11-12');
      editDate.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const start = [...container.querySelectorAll('input[aria-label="Start time"]')].at(-1);
    await act(async () => {
      setValue.call(start, '13:30');
      start.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      find(container, 'Save new date and time').click();
    });
    expect(caApi.rescheduleExamNotice).toHaveBeenCalledWith('n-b', {
      date: '2026-11-12',
      startTime: '13:30',
      venue: 'Main Hall',
    });
    expect(container.textContent).toContain('reminders were regenerated');
    root.unmount();
  });

  it('cancels a notice only with a reason', async () => {
    caApi.cancelExamNotice.mockResolvedValue({ data: {} });
    const { container, root } = await mount();
    await act(async () => {
      find(container, 'Cancel notice').click();
    });
    expect(find(container, 'Confirm cancellation').disabled).toBe(true);
    await type(container, 'Reason for cancelling', 'Hall unavailable');
    expect(find(container, 'Confirm cancellation').disabled).toBe(false);
    await act(async () => {
      find(container, 'Confirm cancellation').click();
    });
    expect(caApi.cancelExamNotice).toHaveBeenCalledWith('n-b', 'Hall unavailable');
    root.unmount();
  });

  it('completes one subject, identified by its link, after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    caApi.completeSubject.mockResolvedValue({ data: {} });
    const { container, root } = await mount();
    const completeButtons = [...container.querySelectorAll('button')].filter((item) => item.textContent === 'Mark completed');
    expect(completeButtons).toHaveLength(2);
    await act(async () => {
      completeButtons[1].click();
    });
    expect(caApi.completeSubject).toHaveBeenCalledTimes(1);
    expect(caApi.completeSubject).toHaveBeenCalledWith('l-b');
    root.unmount();
  });

  it('shows per-channel delivery status honestly, including failures', async () => {
    caApi.examNoticeDelivery.mockResolvedValue({
      data: {
        items: [
          { channel: 'EMAIL', status: 'SENT', count: 2 },
          { channel: 'WHATSAPP', status: 'FAILED', count: 2 },
        ],
      },
    });
    const { container, root } = await mount();
    await act(async () => {
      find(container, 'Delivery status').click();
    });
    expect(container.querySelector('[aria-label="Delivery status"]').textContent).toBe('EMAIL SENT 2 · WHATSAPP FAILED 2');
    root.unmount();
  });
});
