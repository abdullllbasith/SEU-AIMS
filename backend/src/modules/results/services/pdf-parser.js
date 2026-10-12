import {
  looksLikeRegistrationNumber,
  looksLikeSubjectCode,
  normalizeRegistrationNumber,
  normalizeResultCode,
  normalizeSubjectCode,
} from './normalize.js';

function extractPdfStrings(buffer) {
  const text = buffer.toString('latin1');
  const literals = [];
  const paren = /\((?:\\.|[^\\)])*\)/g;
  let match;
  while ((match = paren.exec(text))) {
    literals.push(match[0].slice(1, -1).replace(/\\n/g, ' ').replace(/\\/g, ''));
  }
  return literals.join(' ');
}

function meaningfulLength(text) {
  return String(text || '')
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
    .replace(/\s+/g, '').length;
}

async function pdfParseText(buffer) {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = result?.text || '';
      if (text.replace(/\s/g, '').length > 0) {
        return text;
      }
    } finally {
      await parser.destroy?.();
    }
  } catch {
    // Not a readable PDF document. Fall back to literal strings in simple test PDFs.
  }
  return extractPdfStrings(buffer);
}

export async function parsePdfResults(buffer) {
  const text = await pdfParseText(buffer);
  const tokens = text.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  const extracted = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const registrationNumber = normalizeRegistrationNumber(tokens[index]);
    if (!looksLikeRegistrationNumber(registrationNumber)) {
      continue;
    }
    const subjectToken = tokens[index + 1];
    const resultToken = tokens[index + 2];
    if (!looksLikeSubjectCode(subjectToken) || !resultToken) {
      continue;
    }
    extracted.push({
      registrationNumber,
      subjectCode: normalizeSubjectCode(subjectToken),
      resultCode: normalizeResultCode(resultToken),
      displayName: '',
      sourceLocation: `pdf:token:${index}`,
    });
  }
  const unique = [];
  const seen = new Set();
  for (const row of extracted) {
    const key = `${row.registrationNumber}|${row.subjectCode}|${row.resultCode}|${row.sourceLocation}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(row);
  }
  const textCharacters = meaningfulLength(text);
  const warnings = [];
  if (!unique.length) {
    warnings.push(
      textCharacters < 40
        ? 'PDF has no selectable result text. A scanned image cannot be read.'
        : 'No result rows were identified in the PDF',
    );
  }
  return { rows: unique, warnings, textCharacters };
}
