import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffAgentChat } from './StaffAgentChat.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setValue(element, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('StaffAgentChat', () => {
  let container;
  let root;
  let api;

  const render = (props = {}) =>
    act(async () => {
      root.render(
        <StaffAgentChat
          api={api}
          title="Ask"
          subtitle="TEACHING"
          intro="Intro text"
          suggestions={['What needs my attention?']}
          placeholder="Ask…"
          {...props}
        />,
      );
    });

  const type = async (text) => {
    await act(async () => setValue(container.querySelector('textarea'), text));
  };
  const submit = async () => {
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    api = { send: vi.fn() };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the read-only badge, intro and suggestions before the first question', async () => {
    await render();
    expect(container.textContent).toContain('Read-only');
    expect(container.textContent).toContain('Intro text');
    expect(container.textContent).toContain('What needs my attention?');
  });

  it('sends the question, renders the answer and lists the cited data', async () => {
    api.send.mockResolvedValue({
      data: {
        reply: 'You have **2** items [my_dashboard].',
        sources: [{ tool: 'my_dashboard', label: 'Lecturer dashboard', ok: true, cited: true }],
      },
    });
    await render();
    await type('What needs attention?');
    await submit();

    expect(api.send).toHaveBeenCalledWith({ content: 'What needs attention?', history: [] });
    expect(container.textContent).toContain('What needs attention?');
    expect(container.querySelector('strong').textContent).toBe('2');
    expect(container.querySelector('.study-agent__cite').textContent).toBe('1');
    expect(container.querySelector('.study-agent__sources').textContent).toContain('Lecturer dashboard');
    expect(container.querySelector('textarea').value).toBe('');
  });

  it('sends earlier turns as history on the next question', async () => {
    api.send.mockResolvedValue({ data: { reply: 'First answer.', sources: [] } });
    await render();
    await type('First?');
    await submit();
    await type('And then?');
    await submit();
    expect(api.send).toHaveBeenLastCalledWith({
      content: 'And then?',
      history: [
        { role: 'user', text: 'First?' },
        { role: 'agent', text: 'First answer.' },
      ],
    });
  });

  it('warns when some data could not be loaded', async () => {
    api.send.mockResolvedValue({
      data: { reply: 'Partial answer.', sources: [{ tool: 'ca_schedules', label: 'CA schedules', ok: false, cited: false }] },
    });
    await render();
    await type('CA?');
    await submit();
    expect(container.textContent).toContain('Could not load: CA schedules');
  });

  it('puts the question back and shows the error when the request fails', async () => {
    api.send.mockRejectedValue(new Error('The AI service is not configured'));
    await render();
    await type('Will this work?');
    await submit();
    expect(container.querySelector('[role="alert"]').textContent).toContain('not configured');
    expect(container.querySelector('textarea').value).toBe('Will this work?');
    expect(container.querySelectorAll('.study-agent__message')).toHaveLength(0);
  });

  it('ignores empty input and a suggestion sends straight away', async () => {
    api.send.mockResolvedValue({ data: { reply: 'Ok.', sources: [] } });
    await render();
    await type('   ');
    expect(container.querySelector('button[type="submit"]').disabled).toBe(true);
    await submit();
    expect(api.send).not.toHaveBeenCalled();

    const suggestion = [...container.querySelectorAll('button')].find((button) => button.textContent === 'What needs my attention?');
    await act(async () => suggestion.click());
    expect(api.send).toHaveBeenCalledWith({ content: 'What needs my attention?', history: [] });
  });

  it('clears the conversation with New chat', async () => {
    api.send.mockResolvedValue({ data: { reply: 'Ok.', sources: [] } });
    await render();
    await type('Hello');
    await submit();
    expect(container.querySelectorAll('.study-agent__message')).toHaveLength(2);
    const reset = [...container.querySelectorAll('button')].find((button) => button.textContent === 'New chat');
    await act(async () => reset.click());
    expect(container.querySelectorAll('.study-agent__message')).toHaveLength(0);
    expect(container.textContent).toContain('Intro text');
  });

  it('renders model text as text, never as HTML', async () => {
    api.send.mockResolvedValue({ data: { reply: '<img src=x onerror=alert(1)> **ok**', sources: [] } });
    await render();
    await type('xss');
    await submit();
    expect(container.querySelector('.study-agent__prose img')).toBeNull();
    expect(container.querySelector('.study-agent__prose').textContent).toContain('<img src=x');
  });
});
