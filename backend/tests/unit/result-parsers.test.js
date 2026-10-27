import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { parseXlsxResults } from '../../src/modules/results/services/xlsx-parser.js';
import { parsePdfResults } from '../../src/modules/results/services/pdf-parser.js';
import {
  looksLikeSubjectCode,
  normalizeRegistrationNumber,
  normalizeResultCode,
  normalizeSubjectCode,
} from '../../src/modules/results/services/normalize.js';

test('registration normalization is trim and case only', () => {
  assert.equal(normalizeRegistrationNumber('  seu/is/22/ict/001  '), 'SEU/IS/22/ICT/001');
  assert.equal(normalizeResultCode('e(ca)'), 'E(CA)');
  assert.equal(normalizeResultCode('ab'), 'AB');
  assert.equal(normalizeResultCode('E(ESA)'), 'E(ESA)');
  assert.equal(normalizeResultCode('E(CA&ESA)'), 'E(CA&ESA)');
});

test('xlsx parser supports narrow registration/subject/result columns', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Results');
  sheet.addRow(['Registration Number', 'Student Name', 'Subject Code', 'Result']);
  sheet.addRow(['SEU/IS/22/ICT/001', 'Ignored Name', 'ICT1233', 'A']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseXlsxResults(buffer);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].registrationNumber, 'SEU/IS/22/ICT/001');
  assert.equal(parsed.rows[0].subjectCode, 'ICT1233');
  assert.equal(parsed.rows[0].resultCode, 'A');
});

test('subject codes accept four- and five-digit SEUSL course numbers', () => {
  assert.equal(normalizeSubjectCode('CMS 12012'), 'CMS12012');
  assert.ok(looksLikeSubjectCode('CMS12012'));
  assert.ok(looksLikeSubjectCode('ICT1233'));
});

test('xlsx parser supports wide subject-code headers', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(['Reg No', 'Name', 'ICT1233', 'ICT1242']);
  sheet.addRow(['SEU/IS/22/ICT/001', 'Anyone', 'B+', 'E(CA)']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseXlsxResults(buffer);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(
    parsed.rows.map((row) => `${row.subjectCode}:${row.resultCode}`).sort(),
    ['ICT1233:B+', 'ICT1242:E(CA)'],
  );
});

test('xlsx parser supports wide five-digit subject-code headers', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Results');
  sheet.addRow(['SN', 'Registration No', 'CMS12012', 'SWT12041']);
  sheet.addRow(['1', 'SEU/IS/22/ICT/001', 'A+', 'B-']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseXlsxResults(buffer);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(
    parsed.rows.map((row) => `${row.subjectCode}:${row.resultCode}`).sort(),
    ['CMS12012:A+', 'SWT12041:B-'],
  );
});

test('pdf parser extracts registration, subject code, and result tokens', async () => {
  const body = `BT\n(SEU/IS/22/ICT/001) Tj\n(ICT1233) Tj\n(A-) Tj\nET`;
  const pdf = Buffer.from(
    `%PDF-1.4\n1 0 obj<<>>endobj\nstream\n${body}\nendstream\ntrailer\n%%EOF\n`,
  );
  const parsed = await parsePdfResults(pdf);
  assert.ok(parsed.rows.some((row) => row.registrationNumber === 'SEU/IS/22/ICT/001' && row.subjectCode === 'ICT1233' && row.resultCode === 'A-'));
});

test('xlsx parser fails closed when there is no registration plus subject plus result', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Names');
  sheet.addRow(['Student Name', 'Index']);
  sheet.addRow(['Same Name As Other Student', '1']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseXlsxResults(buffer);
  assert.equal(parsed.rows.length, 0);
  assert.ok(parsed.warnings.length);
});

test('pdf parser fails closed when tokens are not registration plus subject plus result', async () => {
  const pdf = Buffer.from('%PDF-1.4\nstream\nBT (Department of ICT) Tj (Semester Results) Tj ET\nendstream\n%%EOF\n');
  const parsed = await parsePdfResults(pdf);
  assert.equal(parsed.rows.length, 0);
  assert.ok(parsed.warnings.length);
});
