/** Matches the server's history limit; the server trims again, so this only saves bandwidth. */
export const MAX_HISTORY = 6;
export const MAX_MESSAGE_CHARS = 2000;

/** The server keeps no conversation, so each request carries the last few turns as plain text. */
export function toHistory(messages, limit = MAX_HISTORY) {
  return messages
    .filter((message) => message.text && !message.failed)
    .slice(-limit)
    .map((message) => ({ role: message.role === 'agent' ? 'agent' : 'user', text: message.text }));
}

/**
 * The server cites data as [tool_name]. The shared message renderer understands numbered
 * markers, so each known tool becomes [n] in order of first use. Markers that do not match
 * a tool that ran are left alone, so the model cannot invent a source.
 * @returns {{ text: string, listed: Array<object> }} listed[n - 1] is the source for [n]
 */
export function linkCitations(reply, sources = []) {
  const listed = [];
  const text = String(reply ?? '').replace(/\[([a-z][a-z_]*)\]/g, (whole, name) => {
    const source = sources.find((item) => item.tool === name && item.ok);
    if (!source) {
      return whole;
    }
    let number = listed.indexOf(source) + 1;
    if (!number) {
      listed.push(source);
      number = listed.length;
    }
    return `[${number}]`;
  });
  return { text, listed };
}

/** Tools that ran but could not load, so the reader knows an answer may be incomplete. */
export function failedSources(sources = []) {
  return sources.filter((source) => source.ok === false);
}
