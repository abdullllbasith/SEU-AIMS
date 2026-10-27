import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { NoticeCarousel } from './NoticeCarousel.jsx';

describe('NoticeCarousel', () => {
  let container;
  let root;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    vi.useRealTimers();
  });

  it('shows one photo and advances after 3 seconds', async () => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(NoticeCarousel, {
          label: 'Exam notice',
          images: [
            { id: 'a', url: '/api/notices/n1/images/a' },
            { id: 'b', url: '/api/notices/n1/images/b' },
          ],
        }),
      );
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/notices/n1/images/a');
    expect(container.textContent).toContain('1 / 2');
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/notices/n1/images/b');
    expect(container.textContent).toContain('2 / 2');
  });
});
