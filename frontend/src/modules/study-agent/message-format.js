/**
 * Minimal, safe formatting for tutor replies. Output is plain data that React renders as
 * elements, so model or document text can never inject HTML.
 */

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[\d{1,2}\])/g;

export function parseInline(text) {
  const tokens = [];
  let last = 0;
  for (const match of String(text).matchAll(INLINE)) {
    if (match.index > last) {
      tokens.push({ type: 'text', value: text.slice(last, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('**')) {
      tokens.push({ type: 'bold', value: raw.slice(2, -2) });
    } else if (raw.startsWith('`')) {
      tokens.push({ type: 'code', value: raw.slice(1, -1) });
    } else {
      tokens.push({ type: 'cite', value: Number.parseInt(raw.slice(1, -1), 10) });
    }
    last = match.index + raw.length;
  }
  if (last < text.length) {
    tokens.push({ type: 'text', value: text.slice(last) });
  }
  return tokens;
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

export function parseBlocks(text) {
  const blocks = [];
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'p', text: paragraph.join('\n') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith('```')) {
      flushParagraph();
      flushList();
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    if (line.includes('|') && lines[index + 1] !== undefined && TABLE_DIVIDER.test(lines[index + 1])) {
      flushParagraph();
      flushList();
      const head = splitRow(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        const cells = splitRow(lines[index]);
        rows.push(head.map((_cell, column) => cells[column] ?? ''));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    const image = /^\s*\[image:(\d{1,2})\]\s*$/.exec(line);
    if (image) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'image', index: Number.parseInt(image[1], 10) });
      continue;
    }
    const heading = /^#{1,4}\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'h', text: heading[1] });
    } else if (bullet || numbered) {
      flushParagraph();
      const kind = bullet ? 'ul' : 'ol';
      if (!list || list.type !== kind) {
        flushList();
        list = { type: kind, items: [] };
      }
      list.items.push((bullet || numbered)[1]);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
