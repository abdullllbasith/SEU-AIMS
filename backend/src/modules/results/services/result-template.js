import ExcelJS from 'exceljs';
import { DICT_GRADE_POINTS, RECOGNIZED_NON_GRADE_RESULTS } from '../constants.js';

export const RESULT_TEMPLATE_FILENAME = 'SEU-AIMS-result-import-template.xlsx';

const COURSES = [
  ['CMS12012', 'Statistics'],
  ['CMS12022', 'English-II'],
  ['CMS12031', 'Practical for Statistics'],
  ['MGT12012', 'Multimedia and Graphic Design'],
  ['MGT12021', 'Practical for Multimedia and Graphic Design'],
  ['NST12012', 'Computer Networks'],
  ['SWT12012', 'Object Oriented Programming'],
  ['SWT12022', 'Web systems and Technologies'],
  ['SWT12031', 'Practical for Object Oriented Programming'],
  ['SWT12041', 'Practical for Web systems and Technologies'],
];

const THIN = { style: 'thin', color: { argb: 'FF999999' } };
const BORDER = { left: THIN, right: THIN, top: THIN, bottom: THIN };
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };

export function acceptedResultCodes() {
  return [...Object.keys(DICT_GRADE_POINTS), ...Object.keys(RECOGNIZED_NON_GRADE_RESULTS)];
}

function spacedCode(code) {
  return code.replace(/([A-Z]+)(\d+)/, '$1 $2');
}

function writeBanner(sheet, fourthLine) {
  const lines = [
    ['SOUTH EASTERN UNIVERSITY OF SRI LANKA', { bold: true, size: 12, name: 'Arial' }],
    ['EXAMINATION DIVISION - EXAMINATION RESULTS', { bold: true, size: 12, name: 'Arial' }],
    ['EXAMINATION TITLE (replace this line)', { bold: true, size: 11, name: 'Arial' }],
    [fourthLine, { size: 11, name: 'Arial' }],
  ];
  lines.forEach(([text, font], index) => {
    const cell = sheet.getRow(index + 1).getCell(1);
    cell.value = text;
    cell.font = font;
  });
}

function writeGrid(sheet, { spacedHeaders, example }) {
  const headerRow = sheet.getRow(6);
  const headers = ['SN', 'Registration No', 'Index No', ...(spacedHeaders ? COURSES.map(([code]) => spacedCode(code)) : COURSES.map(([code]) => code))];
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { bold: true, size: 10, name: 'Arial' };
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  headerRow.height = 30;

  for (let rowNumber = 7; rowNumber <= 12; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    headers.forEach((_, index) => {
      const cell = row.getCell(index + 1);
      cell.font = { size: 10, name: 'Arial' };
      cell.border = BORDER;
      cell.alignment = index < 3 ? { horizontal: 'left', vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
    });
  }
  example.forEach((value, index) => {
    sheet.getRow(7).getCell(index + 1).value = value;
  });

  const widths = [6, 22, 12, 18, 16, 16, 20, 16, 16, 14, 21, 12, 12];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  const lastColumn = String.fromCharCode('A'.charCodeAt(0) + headers.length - 1);
  sheet.dataValidations.add(`D7:${lastColumn}200`, {
    type: 'list',
    allowBlank: true,
    formulae: [`"${[...acceptedResultCodes(), '-'].join(',')}"`],
    showErrorMessage: true,
    errorStyle: 'warning',
    errorTitle: 'Result',
    error: 'Use a result from Course Codes & Legend, or - when that course has no result.',
  });
}

export async function buildResultImportTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SEU-AIMS';

  const results = workbook.addWorksheet('Results');
  writeBanner(results, 'Replace the example row. Leave a course blank when it has no result.');
  writeGrid(results, {
    spacedHeaders: false,
    example: ['1', 'SEU/IS/00/ICT/000', 'ICT000', 'A'],
  });

  const repeaters = workbook.addWorksheet('Repeaters');
  writeBanner(repeaters, "REPEATERS. '-' means no result for that course.");
  writeGrid(repeaters, {
    spacedHeaders: true,
    example: ['1', 'SEU/IS/00/ICT/001', 'ICT000R', 'C', '-', '-', '-', '-', '-', '-', '-', '-', '-'],
  });

  const legend = workbook.addWorksheet('Course Codes & Legend');
  legend.getCell('A1').value = 'Course Codes & Titles';
  legend.getCell('A1').font = { bold: true, size: 12, name: 'Arial' };
  COURSES.forEach(([code, title], index) => {
    const row = legend.getRow(index + 3);
    row.getCell(1).value = spacedCode(code);
    row.getCell(2).value = title;
    row.getCell(1).font = { size: 10, name: 'Arial' };
    row.getCell(2).font = { size: 10, name: 'Arial' };
  });
  const markerStart = COURSES.length + 5;
  const markers = [
    ['E(ESA)', RECOGNIZED_NON_GRADE_RESULTS['E(ESA)']],
    ['E(CA)', RECOGNIZED_NON_GRADE_RESULTS['E(CA)']],
    ['E(CA&ESA)', RECOGNIZED_NON_GRADE_RESULTS['E(CA&ESA)']],
    ['ab', 'Absent (as printed in source)'],
    ['-', 'No result for that course'],
  ];
  markers.forEach(([code, note], index) => {
    const row = legend.getRow(markerStart + index);
    row.getCell(1).value = code;
    row.getCell(2).value = note;
    row.getCell(1).font = { size: 10, name: 'Arial' };
    row.getCell(2).font = { size: 10, name: 'Arial' };
  });
  legend.getColumn(1).width = 16;
  legend.getColumn(2).width = 78;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
