import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaQrScanner } from './CaQrScanner.jsx';

const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

function button(container, label) {
  return [...container.querySelectorAll('button')].find((item) => item.textContent === label);
}

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(CaQrScanner, props));
  });
  return { container, root };
}

async function typeInto(container, value) {
  const input = container.querySelector('input[aria-label="Application ID"]');
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

afterEach(() => {
  delete window.BarcodeDetector;
  vi.restoreAllMocks();
});

describe('CaQrScanner', () => {
  it('is locked until the HOD signature inspection is confirmed', async () => {
    const onSubmit = vi.fn().mockResolvedValue('ok');
    const { container, root } = await mount({ onSubmit });
    expect(button(container, 'Verify Application ID').disabled).toBe(true);
    expect(button(container, 'Scan QR').disabled).toBe(true);
    expect(container.textContent).toContain('physical HOD signature');

    await act(async () => {
      container.querySelector('input[type="checkbox"]').click();
    });
    expect(button(container, 'Verify Application ID').disabled).toBe(false);
    expect(button(container, 'Scan QR').disabled).toBe(false);

    await act(async () => {
      container.querySelector('input[type="checkbox"]').click();
    });
    expect(button(container, 'Verify Application ID').disabled).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
    root.unmount();
  });

  it('submits a typed Application ID and reports success', async () => {
    const onSubmit = vi.fn().mockResolvedValue('CA-1 verified');
    const { container, root } = await mount({ onSubmit });
    await act(async () => {
      container.querySelector('input[type="checkbox"]').click();
    });
    await typeInto(container, '  CA-21ICT028-Y1S2 ');
    await act(async () => {
      button(container, 'Verify Application ID').click();
    });
    expect(onSubmit).toHaveBeenCalledWith('CA-21ICT028-Y1S2');
    expect(container.querySelector('[role="status"]').textContent).toBe('CA-1 verified');
    expect(container.querySelector('input[aria-label="Application ID"]').value).toBe('');
    root.unmount();
  });

  it('asks for an ID when empty and keeps manual entry available after a failed verification', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Application not found')).mockResolvedValueOnce('done');
    const { container, root } = await mount({ onSubmit });
    await act(async () => {
      container.querySelector('input[type="checkbox"]').click();
    });
    await act(async () => {
      button(container, 'Verify Application ID').click();
    });
    expect(container.querySelector('[role="alert"]').textContent).toContain('Scan the QR code or enter');
    expect(onSubmit).not.toHaveBeenCalled();

    await typeInto(container, 'CA-99XXX999-Y9S9');
    await act(async () => {
      button(container, 'Verify Application ID').click();
    });
    expect(container.querySelector('[role="alert"]').textContent).toBe('Application not found');
    const input = container.querySelector('input[aria-label="Application ID"]');
    expect(input.value).toBe('CA-99XXX999-Y9S9');
    expect(button(container, 'Verify Application ID').disabled).toBe(false);

    await typeInto(container, 'CA-21ICT028-Y1S2');
    await act(async () => {
      button(container, 'Verify Application ID').click();
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    root.unmount();
  });

  it('falls back to manual entry when the camera is unavailable', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    const { container, root } = await mount({ onSubmit: vi.fn() });
    await act(async () => {
      container.querySelector('input[type="checkbox"]').click();
    });
    await act(async () => {
      button(container, 'Scan QR').click();
    });
    await act(async () => {});
    expect(container.textContent).toContain('cannot open the camera');
    expect(container.querySelector('input[aria-label="Application ID"]')).not.toBeNull();
    root.unmount();
  });

  it('verifies a scanned QR code with the native detector and stops the camera', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      configurable: true,
    });
    window.BarcodeDetector = class {
      async detect() {
        return [{ rawValue: 'http://localhost:3001/api/ca/verify/token-1' }];
      }
    };
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const onSubmit = vi.fn().mockResolvedValue('scanned');
    const { container, root } = await mount({ onSubmit });
    await act(async () => {
      container.querySelector('input[type="checkbox"]').click();
    });
    await act(async () => {
      button(container, 'Scan QR').click();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(onSubmit).toHaveBeenCalledWith('http://localhost:3001/api/ca/verify/token-1');
    expect(stop).toHaveBeenCalled();
    root.unmount();
  });
});
