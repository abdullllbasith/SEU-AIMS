import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { RecoveryResultReviews } from './RecoveryResultReviews.jsx';

describe('RecoveryResultReviews', () => {
  it('asks an authorized reviewer to approve or reject the imported grade', async () => {
    const onDecide = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(RecoveryResultReviews, {
          items: [
            {
              id: 'review-1',
              registrationNumber: 'SEU/IS/22/ICT/001',
              subjectCode: 'ICT1233',
              rawResultCode: 'A+',
            },
          ],
          onDecide,
        }),
      );
    });
    expect(container.textContent).toContain('E(CA)');
    expect(container.textContent).toContain('without a C Pass cap');
    const approve = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Approve');
    await act(async () => {
      approve.click();
    });
    expect(onDecide).toHaveBeenCalledWith('review-1', 'APPROVE');
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
