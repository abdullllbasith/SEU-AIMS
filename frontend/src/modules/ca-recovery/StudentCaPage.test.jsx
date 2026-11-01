import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { SubjectExams } from './StudentCaPage.jsx';

async function render(subjects) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(SubjectExams, { subjects }));
  });
  return { container, root };
}

describe('SubjectExams', () => {
  it('shows each subject of one application with its own exam state, time in Asia/Colombo and venue', async () => {
    const { container, root } = await render([
      {
        incompleteCaId: 'c1',
        subjectCode: 'ICT1001',
        examStatus: 'SCHEDULED',
        exam: { scheduledAt: '2026-11-10T04:00:00.000Z', venue: 'Main Hall' },
      },
      { incompleteCaId: 'c2', subjectCode: 'ICT1002', examStatus: 'READY_TO_SCHEDULE', exam: null },
      { incompleteCaId: 'c3', subjectCode: 'ICT1003', examStatus: 'COMPLETED', exam: null },
    ]);
    const rows = [...container.querySelectorAll('li')].map((row) => row.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('ICT1001');
    expect(rows[0]).toContain('09:30');
    expect(rows[0]).toContain('10 Nov 2026');
    expect(rows[0]).toContain('Asia/Colombo');
    expect(rows[0]).toContain('Main Hall');
    expect(rows[1]).toContain('Waiting for your lecturer');
    expect(rows[2]).toContain('CA attended');
    root.unmount();
  });

  it('shows nothing before approval', async () => {
    const { container, root } = await render([
      { incompleteCaId: 'c1', subjectCode: 'ICT1001', examStatus: 'PENDING_APPROVAL', exam: null },
    ]);
    expect(container.querySelector('ul')).toBeNull();
    root.unmount();
  });

  it('shows nothing when the API sends no subjects', async () => {
    const { container, root } = await render(undefined);
    expect(container.querySelector('ul')).toBeNull();
    root.unmount();
  });
});
