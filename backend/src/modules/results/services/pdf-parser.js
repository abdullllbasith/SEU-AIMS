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

async function pdfParseText(buffer) {
  try {
    const mod = await import('pdf-parse');
    const pdfParse = mod.default || mod;
    const parsed = await pdfParse(buffer);
    return parsed?.text || '';
  } catch {
    return extractPdfStrings(buffer);
  }
}

export async function parsePdfResults(buffer) {
  const text = `${await pdfParseText(buffer)}\n${extractPdfStrings(buffer)}`;
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
  return { rows: unique, warnings: unique.length ? [] : ['No result rows were identified in the PDF'] };
}
