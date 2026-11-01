import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentThinking } from './AgentThinking.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('AgentThinking', () => {
  let container;
  let root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('moves through the reasoning words one after another and stays on the last', () => {
    act(() => root.render(<AgentThinking steps={['One', 'Two', 'Three']} stepMs={1000} />));
    expect(container.textContent).toBe('One…');
    act(() => vi.advanceTimersByTime(1000));
    expect(container.textContent).toBe('Two…');
    act(() => vi.advanceTimersByTime(1000));
    expect(container.textContent).toBe('Three…');
    act(() => vi.advanceTimersByTime(5000));
    expect(container.textContent).toBe('Three…');
  });
});
