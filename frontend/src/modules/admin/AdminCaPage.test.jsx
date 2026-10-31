import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminCaPage } from './AdminCaPage.jsx';

vi.mock('../ca-recovery/ca-api.js', () => ({
  caApi: {
    adminApplications: vi.fn(),
    recoveryResults: vi.fn(),
    adminWindows: vi.fn(),
    unresolvedConditions: vi.fn(),
    scanVerify: vi.fn(),
    reconciliation: vi.fn(),
    backfill: vi.fn(),
    saveWindow: vi.fn(),
    deleteWindow: vi.fn(),
    decideRecovery: vi.fn(),
  },
}));
vi.mock('./academic-api.js', () => ({
  academicApi: {
    years: vi.fn(),
    semesters: vi.fn(),
  },
}));

const { caApi } = await import('../ca-recovery/ca-api.js');
const { academicApi } = await import('./academic-api.js');

const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/admin/ca'] }, createElement(AdminCaPage)));
  });
  return { container, root };
}

describe('/admin/ca verify printed form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    caApi.adminApplications.mockResolvedValue({ data: { items: [] } });
    caApi.recoveryResults.mockResolvedValue({ data: { items: [] } });
    caApi.adminWindows.mockResolvedValue({ data: { items: [] } });
    caApi.unresolvedConditions.mockResolvedValue({ data: { items: [] } });
    academicApi.years.mockResolvedValue({ data: { items: [] } });
    academicApi.semesters.mockResolvedValue({ data: { items: [] } });
  });

  it('verifies by Application ID on the queue page, reports it is not approved, and links to review', async () => {
    caApi.scanVerify.mockResolvedValue({ data: { applicationId: 'CA-21ICT028-Y1S2', alreadyVerified: false } });
    const { container, root } = await mount();
    expect(container.textContent).toContain('Verify printed form');

    const verify = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Verify Application ID');
    expect(verify.disabled).toBe(true);
    await act(async () => {
      container.querySelector('input[type="checkbox"]').click();
    });
    const input = container.querySelector('input[aria-label="Application ID"]');
    await act(async () => {
      setValue.call(input, 'CA-21ICT028-Y1S2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      verify.click();
    });
    expect(caApi.scanVerify).toHaveBeenCalledWith('CA-21ICT028-Y1S2', true);
    expect(caApi.adminApplications).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('CA-21ICT028-Y1S2 is physically verified');
    expect(container.textContent).toContain('It is not approved yet');
    const link = [...container.querySelectorAll('a')].find((item) => item.textContent === 'Review & approve');
    expect(link.getAttribute('href')).toBe('/admin/ca/CA-21ICT028-Y1S2');
    root.unmount();
  });

  it('reports a repeated scan as already verified', async () => {
    caApi.scanVerify.mockResolvedValue({ data: { applicationId: 'CA-1', alreadyVerified: true } });
    const { container, root } = await mount();
    await act(async () => {
      container.querySelector('input[type="checkbox"]').click();
    });
    const input = container.querySelector('input[aria-label="Application ID"]');
    await act(async () => {
      setValue.call(input, 'CA-1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll('button')].find((item) => item.textContent === 'Verify Application ID').click();
    });
    expect(container.textContent).toContain('CA-1 was already physically verified');
    root.unmount();
  });

  it('shows the error and keeps manual entry when the scan is rejected', async () => {
    caApi.scanVerify.mockRejectedValue(new Error('Application not found'));
    const { container, root } = await mount();
    await act(async () => {
      container.querySelector('input[type="checkbox"]').click();
    });
    const input = container.querySelector('input[aria-label="Application ID"]');
    await act(async () => {
      setValue.call(input, 'CA-99XXX999-Y9S9');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      [...container.querySelectorAll('button')].find((item) => item.textContent === 'Verify Application ID').click();
    });
    expect(container.textContent).toContain('Application not found');
    expect(container.textContent).not.toContain('is physically verified');
    expect(container.querySelector('input[aria-label="Application ID"]')).not.toBeNull();
    root.unmount();
  });
});
