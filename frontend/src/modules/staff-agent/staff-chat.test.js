import { describe, expect, it } from 'vitest';
import { failedSources, linkCitations, toHistory } from './staff-chat.js';

describe('toHistory', () => {
  it('keeps the last turns as plain role and text', () => {
    const messages = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
      role: index % 2 ? 'agent' : 'user',
      text: `turn ${index}`,
      sources: [{ tool: 'x' }],
    }));
    const history = toHistory(messages);
    expect(history).toHaveLength(6);
    expect(history[0]).toEqual({ role: 'user', text: 'turn 4' });
    expect(Object.keys(history[1]).sort()).toEqual(['role', 'text']);
  });

  it('skips empty and failed messages', () => {
    expect(toHistory([{ role: 'user', text: '' }, { role: 'user', text: 'a', failed: true }, { role: 'agent', text: 'b' }])).toEqual([
      { role: 'agent', text: 'b' },
    ]);
  });
});

describe('linkCitations', () => {
  const sources = [
    { tool: 'my_dashboard', label: 'Lecturer dashboard', ok: true },
    { tool: 'upcoming', label: 'Upcoming', ok: true },
    { tool: 'ca_schedules', label: 'CA schedules', ok: false },
  ];

  it('numbers tools in order of first use and reuses a number for a repeat', () => {
    const { text, listed } = linkCitations('Two items [upcoming]. One alert [my_dashboard]. Again [upcoming].', sources);
    expect(text).toBe('Two items [1]. One alert [2]. Again [1].');
    expect(listed.map((source) => source.tool)).toEqual(['upcoming', 'my_dashboard']);
  });

  it('leaves markers alone when no tool ran with that name or it failed to load', () => {
    const { text, listed } = linkCitations('Made up [secret_tool] and failed [ca_schedules].', sources);
    expect(text).toBe('Made up [secret_tool] and failed [ca_schedules].');
    expect(listed).toEqual([]);
  });

  it('does not touch numeric brackets or ordinary text', () => {
    expect(linkCitations('Section [2] and [A]', sources).text).toBe('Section [2] and [A]');
  });

  it('tolerates a missing reply or sources', () => {
    expect(linkCitations(undefined, undefined)).toEqual({ text: '', listed: [] });
  });
});

describe('failedSources', () => {
  it('returns only tools that could not load', () => {
    expect(failedSources([{ tool: 'a', ok: true }, { tool: 'b', ok: false }]).map((source) => source.tool)).toEqual(['b']);
    expect(failedSources()).toEqual([]);
  });
});
