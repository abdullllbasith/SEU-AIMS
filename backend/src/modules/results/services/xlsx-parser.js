import ExcelJS from 'exceljs';
import {
  looksLikeRegistrationNumber,
  looksLikeSubjectCode,
  normalizeRegistrationNumber,
  normalizeResultCode,
  normalizeSubjectCode,
} from './normalize.js';

function cellText(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'object' && value.text) {
    return String(value.text);
  }
  if (typeof value === 'object' && value.result != null) {
    return String(value.result);
  }
  return String(value);
}

function headerKey(text) {
  return cellText(text).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export async function parseXlsxResults(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { rows: [], warnings: ['Workbook has no worksheets'] };
  }

  const matrix = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = cellText(cell.value);
    });
    matrix.push({ rowNumber, values });
  });

  let headerIndex = matrix.findIndex((row) =>
    row.values.some((value) => {
      const key = headerKey(value);
      return key.includes('registration') || key.includes('regno') || key === 'reg';
    }),
  );
  if (headerIndex < 0) {
    headerIndex = 0;
  }
  const header = matrix[headerIndex]?.values || [];
  const registrationCol = header.findIndex((value) => {
    const key = headerKey(value);
    return key.includes('registration') || key.includes('regno') || key === 'reg';
  });
  const subjectCol = header.findIndex((value) => {
    const key = headerKey(value);
    return key.includes('subjectcode') || key === 'code' || key === 'subject';
  });
  const resultCol = header.findIndex((value) => {
    const key = headerKey(value);
    return key.includes('result') || key.includes('grade') || key === 'mark';
  });
  const nameCol = header.findIndex((value) => headerKey(value).includes('name'));

  const subjectColumns = [];
  header.forEach((value, index) => {
    if (looksLikeSubjectCode(value)) {
      subjectColumns.push({ index, code: normalizeSubjectCode(value) });
    }
  });

  const extracted = [];
  for (const row of matrix.slice(headerIndex + 1)) {
    const registrationNumber = normalizeRegistrationNumber(
      registrationCol >= 0 ? row.values[registrationCol] : row.values[0],
    );
    if (!looksLikeRegistrationNumber(registrationNumber)) {
      continue;
    }
    const displayName = nameCol >= 0 ? cellText(row.values[nameCol]) : '';
    if (subjectColumns.length) {
      for (const column of subjectColumns) {
        const resultCode = normalizeResultCode(row.values[column.index]);
        if (!resultCode) {
          continue;
        }
        extracted.push({
          registrationNumber,
          subjectCode: column.code,
          resultCode,
          displayName,
          sourceLocation: `sheet:${sheet.name}:row:${row.rowNumber}:col:${column.index + 1}`,
        });
      }
      continue;
    }
    const subjectCode = normalizeSubjectCode(subjectCol >= 0 ? row.values[subjectCol] : '');
    const resultCode = normalizeResultCode(resultCol >= 0 ? row.values[resultCol] : '');
    if (!subjectCode || !resultCode) {
      continue;
    }
    extracted.push({
      registrationNumber,
      subjectCode,
      resultCode,
      displayName,
      sourceLocation: `sheet:${sheet.name}:row:${row.rowNumber}`,
    });
  }

  return { rows: extracted, warnings: extracted.length ? [] : ['No result rows were identified'] };
}
