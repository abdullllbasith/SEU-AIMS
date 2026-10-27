import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminCaReview } from './AdminCaReview.jsx';

vi.mock('../ca-recovery/ca-api.js', () => ({
  caApi: {
    get: vi.fn(),
    confirmReceipt: vi.fn(),
    verify: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    reopen: vi.fn(),
    download: vi.fn(),
  },
}));

const { caApi } = await import('../ca-recovery/ca-api.js');

function physicalButton(container) {
  return [...container.querySelectorAll('button')].find((button) => button.textContent === 'Physical OK');
}

describe('AdminCaReview physical receipt', () => {
  it('keeps Physical OK unavailable until the printed form id matches', async () => {
    caApi.get.mockResolvedValue({
      data: {
        applicationId: 'CA-21ICT028-Y1S2',
        registrationNumber: 'SEU/IS/21/ICT/028',
        workflowStatus: 'SUBMITTED',
        physicalVerificationStatus: 'AWAITING_PHYSICAL',
        form: null,
      },
    });
    caApi.confirmReceipt.mockRejectedValueOnce(new Error('This form id does not match the application on screen'));
    caApi.confirmReceipt.mockResolvedValueOnce({ data: { matched: true, applicationId: 'CA-21ICT028-Y1S2' } });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(MemoryRouter, null, createElement(AdminCaReview, { applicationId: 'CA-21ICT028-Y1S2' })));
    });

    expect(physicalButton(container)?.disabled).toBe(true);

    const input = container.querySelector('input[aria-label="Printed form id"]');
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setValue.call(input, 'CA-00ICT000-Y9S9');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirm form').click();
    });
    expect(container.textContent).toContain('does not match');
    expect(physicalButton(container)?.disabled).toBe(true);

    await act(async () => {
      setValue.call(input, 'CA-21ICT028-Y1S2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll('button')].find((button) => button.textContent === 'Confirm form').click();
    });
    expect(container.textContent).toContain('Physical OK is available');
    expect(physicalButton(container)?.disabled).toBe(false);
    expect(caApi.verify).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });
});
