import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

function button(container, label) {
  return [...container.querySelectorAll('button')].find((item) => item.textContent === label);
}

async function typeInto(input, value) {
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function tick(container) {
  const box = container.querySelector('input[type="checkbox"]');
  await act(async () => {
    box.click();
  });
}

const application = (extra = {}) => ({
  data: {
    applicationId: 'CA-21ICT028-Y1S2',
    registrationNumber: 'SEU/IS/21/ICT/028',
    workflowStatus: 'SUBMITTED',
    physicalVerificationStatus: 'AWAITING_PHYSICAL',
    form: null,
    ...extra,
  },
});

async function mount(applicationId = 'CA-21ICT028-Y1S2') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(AdminCaReview, { applicationId })));
  });
  return { container, root };
}

describe('AdminCaReview physical verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps verification locked until the admin confirms the HOD signature inspection, then verifies in one step', async () => {
    caApi.get
      .mockResolvedValueOnce(application())
      .mockResolvedValue(application({ workflowStatus: 'UNDER_VERIFICATION', physicalVerificationStatus: 'PHYSICALLY_VERIFIED' }));
    caApi.verify.mockRejectedValueOnce(new Error('Enter or scan the printed form for this application'));
    caApi.verify.mockResolvedValueOnce({ data: {} });

    const { container, root } = await mount();
    expect(button(container, 'Physical OK')).toBeUndefined();
    expect(button(container, 'Verify Application ID').disabled).toBe(true);
    expect(button(container, 'Scan QR').disabled).toBe(true);

    await tick(container);
    expect(button(container, 'Verify Application ID').disabled).toBe(false);

    const input = container.querySelector('input[aria-label="Application ID"]');
    await typeInto(input, 'CA-00ICT000-Y9S9');
    await act(async () => {
      button(container, 'Verify Application ID').click();
    });
    expect(caApi.verify).toHaveBeenCalledWith('CA-21ICT028-Y1S2', {
      outcome: 'verified',
      receipt: 'CA-00ICT000-Y9S9',
      inspectionConfirmed: true,
    });
    expect(container.textContent).toContain('Enter or scan the printed form');
    expect(caApi.approve).not.toHaveBeenCalled();

    await typeInto(input, 'CA-21ICT028-Y1S2');
    await act(async () => {
      button(container, 'Verify Application ID').click();
    });
    expect(caApi.verify).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('physically verified');
    expect(caApi.approve).not.toHaveBeenCalled();
    // Approval is still a separate action the admin must take.
    expect(button(container, 'Approve')).toBeDefined();

    root.unmount();
    container.remove();
  });

  it('offers approve and reject separately once the physical copy is verified', async () => {
    caApi.get.mockResolvedValue(
      application({ workflowStatus: 'UNDER_VERIFICATION', physicalVerificationStatus: 'PHYSICALLY_VERIFIED' }),
    );
    const { container, root } = await mount();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(button(container, 'Approve')).toBeDefined();
    expect(button(container, 'Reject')).toBeDefined();
    expect(container.textContent).toContain('already verified');
    root.unmount();
    container.remove();
  });
});
