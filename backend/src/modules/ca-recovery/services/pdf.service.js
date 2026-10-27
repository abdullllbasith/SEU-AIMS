import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { StoredFile } from '../../files/index.js';
import { CaApplication } from '../models/ca-application.model.js';
import { CA_PDF_TEMPLATE_VERSION } from '../constants.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { recordCaAudit } from './notify.js';
import { composeExamFormForApplication } from './exam-form.service.js';

const LOGO_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../public/South_Eastern_University_of_Sri_Lanka_logo.png',
);
const YEAR_LABELS = [
  ['1', 'First Year'],
  ['2', 'Second Year'],
  ['3', 'Third Year'],
  ['4', 'Fourth Year'],
];
const A5 = [419.53, 595.28];

function pdfText(value, max = 120) {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function fitText(text, font, size, maxWidth) {
  let value = pdfText(text);
  if (!value) {
    return '';
  }
  while (value.length > 1 && font.widthOfTextAtSize(value, size) > maxWidth) {
    value = value.slice(0, -1);
  }
  return value;
}

async function qrPng(text) {
  try {
    const qrcode = await import('qrcode');
    return qrcode.toBuffer(text, { type: 'png', margin: 1, width: 160 });
  } catch {
    return null;
  }
}

export async function generateApplicationPdf({ applicationId, config, infrastructure }) {
  const application = await CaApplication.findOne({ applicationId });
  if (!application) {
    return null;
  }
  if (
    application.pdfStatus === 'READY' &&
    application.pdfFileId &&
    application.pdfTemplateVersion === CA_PDF_TEMPLATE_VERSION
  ) {
    return application;
  }
  application.pdfStatus = 'GENERATING';
  await application.save();
  try {
    const form = await composeExamFormForApplication(application);
    const publicUrl = config?.api?.publicUrl || 'http://localhost:3001';
    const verifyUrl = `${publicUrl}/api/ca/verify/${application.qrVerificationToken}`;
    const pdf = await PDFDocument.create();
    const page = pdf.addPage(A5);
    const font = await pdf.embedFont(StandardFonts.TimesRoman);
    const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    const ink = rgb(0.05, 0.05, 0.05);
    const left = 16;
    const right = A5[0] - 16;
    const width = right - left;
    const draw = (text, x, y, size = 8, face = font) => {
      const line = pdfText(text);
      if (!line) {
        return;
      }
      page.drawText(line, { x, y, size, font: face, color: ink });
    };
    const fitted = (text, x, y, size, maxWidth, face = font) => {
      draw(fitText(text, face, size, maxWidth), x, y, size, face);
    };
    const rule = (x1, x2, y, thickness = 0.6) => {
      page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: ink });
    };
    const box = (x, y, boxWidth, boxHeight) => {
      page.drawRectangle({
        x,
        y,
        width: boxWidth,
        height: boxHeight,
        borderColor: ink,
        borderWidth: 0.7,
      });
    };
    const tick = (x, y, checked) => {
      box(x, y, 8, 8);
      if (checked) {
        draw('X', x + 1.6, y + 1.2, 7, bold);
      }
    };
    try {
      const logoBytes = await readFile(LOGO_PATH);
      const logo = await pdf.embedPng(logoBytes);
      page.drawImage(logo, { x: left, y: A5[1] - 58, width: 40, height: 40 });
    } catch {
      // The form remains valid if the crest file cannot be read.
    }
    const center = (text, y, size, face) => {
      const value = pdfText(text);
      const textWidth = face.widthOfTextAtSize(value, size);
      draw(value, (A5[0] - textWidth) / 2, y, size, face);
    };
    center('SOUTH EASTERN UNIVERSITY OF SRI LANKA', A5[1] - 28, 8, bold);
    center('EXAMINATION DIVISION', A5[1] - 39, 8, bold);
    center('APPLICATION FOR EXAMINATION (Continuous Assessment)', A5[1] - 50, 6.5, bold);
    center('(Repeat Candidates only)', A5[1] - 60, 7, italic);
    const png = await qrPng(verifyUrl);
    const qrSize = 46;
    if (png) {
      const image = await pdf.embedPng(png);
      page.drawImage(image, {
        x: A5[0] - 14 - qrSize,
        y: A5[1] - 16 - qrSize,
        width: qrSize,
        height: qrSize,
      });
    }
    draw('This form should be completed in CAPITAL letters and the appropriate box ticked.', left, 478, 6.5, italic);
    draw('PART - I', left, 464, 9, bold);

    let cursor = left;
    const place = (text, y, size, face) => {
      draw(text, cursor, y, size, face);
      cursor += face.widthOfTextAtSize(pdfText(text), size) + 4;
    };
    const title = form.title || '';
    cursor = left;
    place('01. Name with initials:', 448, 8, bold);
    tick(cursor, 446, title === 'Mr.');
    cursor += 11;
    place('Mr.', 448, 8, font);
    tick(cursor, 446, title === 'Ms.');
    cursor += 11;
    place('Ms.', 448, 8, font);
    rule(cursor, right, 446);
    fitted(String(form.name || '').toUpperCase(), cursor + 2, 449, 8, right - cursor - 4, bold);

    const registration = pdfText(form.registrationNumber || application.registrationNumber, 40).toUpperCase();
    const suffix = registration.startsWith('SEU/IS/') ? registration.slice('SEU/IS/'.length) : registration;
    cursor = left;
    place('02. Registration No.:', 430, 8, bold);
    place('SEU/IS/', 430, 8, bold);
    const numberWidth = Math.max(78, bold.widthOfTextAtSize(suffix || '00/ICT/000', 8) + 10);
    rule(cursor, cursor + numberWidth, 428);
    fitted(suffix, cursor + 3, 431, 8, numberWidth - 6, bold);

    cursor = left;
    place('03. Current Academic Year:', 412, 8, bold);
    box(cursor, 408, 78, 13);
    fitted(String(form.currentYear || '').toUpperCase(), cursor + 3, 411, 7, 72, bold);
    draw('/', cursor + 82, 411, 8, bold);
    box(cursor + 90, 408, 78, 13);
    fitted(String(form.currentSemester || '').toUpperCase(), cursor + 93, 411, 7, 72, bold);

    cursor = left;
    place('04. Faculty:', 392, 8, bold);
    tick(cursor, 390, true);
    cursor += 11;
    place('FT', 392, 8, bold);
    cursor += 8;
    place('05. Semester:', 392, 8, bold);
    tick(cursor, 390, form.examinationSemester === 'I');
    cursor += 11;
    place('I', 392, 8, font);
    tick(cursor, 390, form.examinationSemester === 'II');
    cursor += 11;
    place('II', 392, 8, font);

    cursor = left;
    place('06. Year of Examination:', 374, 8, bold);
    YEAR_LABELS.forEach(([year, label]) => {
      tick(cursor, 372, form.examinationYear === year);
      cursor += 11;
      place(label, 374, 7, font);
      cursor += 4;
    });

    cursor = left;
    place('07. Field of Specialization (if any):', 356, 8, bold);
    rule(cursor, right, 354);
    fitted(String(form.specialization || '').toUpperCase(), cursor + 2, 357, 7.5, right - cursor - 4, bold);

    draw('08. Present Address:', left, 340, 8, bold);
    box(left, 314, width, 20);
    fitted(String(form.address || '').toUpperCase(), left + 4, 324, 7, width - 8);

    cursor = left;
    place('09. Contact Mobile No.:', 300, 8, bold);
    box(cursor, 296, 110, 13);
    fitted(form.mobile || '', cursor + 3, 299, 8, 104);

    draw('10. Applied subjects:', left, 282, 8, bold);
    const columns = [28, 108, width - 28 - 108 - 78, 78];
    const tableTop = 276;
    const headerHeight = 22;
    const rowHeight = 13.5;
    const tableBottom = tableTop - headerHeight - rowHeight * 8;
    const boundaries = [left];
    columns.reduce((cursor, column) => {
      const next = cursor + column;
      boundaries.push(next);
      return next;
    }, left);
    for (let index = 0; index < boundaries.length; index += 1) {
      page.drawLine({
        start: { x: boundaries[index], y: tableTop },
        end: { x: boundaries[index], y: tableBottom },
        thickness: 0.6,
        color: ink,
      });
    }
    rule(left, right, tableTop);
    rule(left, right, tableTop - headerHeight);
    for (let index = 1; index <= 8; index += 1) {
      rule(left, right, tableTop - headerHeight - rowHeight * index);
    }
    const headerLines = [
      ['SNo.'],
      ['Subject Code', '(Specify Credit)'],
      ['Subject Title'],
      ['Signature of', 'Head of Department'],
    ];
    headerLines.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => {
        const size = 6;
        const textWidth = bold.widthOfTextAtSize(line, size);
        const x = boundaries[index] + Math.max(2, (columns[index] - textWidth) / 2);
        draw(line, x, tableTop - 9 - lineIndex * 7, size, bold);
      });
    });
    const subjects = Array.from({ length: 8 }, (_, index) => form.subjects[index] || { code: '', credits: '', title: '' });
    subjects.forEach((row, index) => {
      const y = tableTop - headerHeight - rowHeight * index - 9.5;
      draw(String(index + 1).padStart(2, '0'), boundaries[0] + 6, y, 7);
      const code = row.code ? `${String(row.code).toUpperCase()}${row.credits ? ` (${row.credits})` : ''}` : '';
      fitted(code, boundaries[1] + 3, y, 7, columns[1] - 6);
      fitted(String(row.title || '').toUpperCase(), boundaries[2] + 3, y, 7, columns[2] - 6);
    });

    const signatureLine = tableBottom - 34;
    draw('Date:', left, signatureLine - 12, 8, bold);
    box(left + 26, signatureLine - 15, 88, 13);
    fitted(form.signedOn || '', left + 30, signatureLine - 12, 7, 80);
    const candidateLine = 128;
    const candidateLabel = 'Signature of Candidate';
    rule(right - candidateLine, right, signatureLine);
    draw(
      candidateLabel,
      right - candidateLine + (candidateLine - font.widthOfTextAtSize(candidateLabel, 7)) / 2,
      signatureLine - 12,
      7,
    );

    const partTop = signatureLine - 28;
    for (let x = left; x < right; x += 4) {
      rule(x, Math.min(x + 2, right), partTop, 0.5);
    }
    draw('Part - II', left, partTop - 14, 9, bold);
    draw('Certified that items 01 - 10 are checked with me and found correct.', left, partTop - 26, 7.5);
    const subjectLine = 150;
    const subjectLabel = 'Signature of Subject in charge';
    const registrarLine = 120;
    const registrarLabel = 'Assistant Registrar';
    rule(left, left + subjectLine, partTop - 46);
    rule(right - registrarLine, right, partTop - 46);
    draw(subjectLabel, left + Math.max(0, (subjectLine - font.widthOfTextAtSize(subjectLabel, 7)) / 2), partTop - 58, 7);
    draw(
      registrarLabel,
      right - registrarLine + (registrarLine - font.widthOfTextAtSize(registrarLabel, 7)) / 2,
      partTop - 58,
      7,
    );
    const frame = 8;
    page.drawRectangle({
      x: frame,
      y: frame,
      width: A5[0] - frame * 2,
      height: A5[1] - frame * 2,
      borderColor: ink,
      borderWidth: 0.8,
    });
    const officeNote = 'office use only';
    const officeSize = 6;
    const officeWidth = italic.widthOfTextAtSize(officeNote, officeSize);
    const officeX = A5[0] - frame - 12 - officeWidth;
    const borderTop = A5[1] - frame;
    page.drawRectangle({
      x: officeX - 3,
      y: borderTop - 1.2,
      width: officeWidth + 6,
      height: 2.5,
      color: rgb(1, 1, 1),
    });
    draw(officeNote, officeX, borderTop - 2, officeSize, italic);
    const idLabel = pdfText(application.applicationId);
    const idSize = 7;
    const idWidth = bold.widthOfTextAtSize(idLabel, idSize);
    const idX = frame + 12;
    page.drawRectangle({
      x: idX - 3,
      y: borderTop - 1.2,
      width: idWidth + 6,
      height: 2.5,
      color: rgb(1, 1, 1),
    });
    draw(idLabel, idX, borderTop - 2.2, idSize, bold);
    const bytes = await pdf.save();
    const buffer = Buffer.from(bytes);
    if (!infrastructure.storage?.putObject) {
      throw new Error('storage_unavailable');
    }
    const storageKey = `ca-applications/${application._id}/${CA_PDF_TEMPLATE_VERSION}.pdf`;
    await infrastructure.storage.putObject({
      key: storageKey,
      body: buffer,
      contentType: 'application/pdf',
    });
    const file = await StoredFile.findOneAndUpdate(
      { storageKey },
      {
        storageKey,
        originalFilename: `${application.applicationId}.pdf`,
        displayFilename: `${application.applicationId}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: buffer.length,
        uploadedByUserId: application.studentUserId,
        owningDomain: 'CA_APPLICATION_PDF',
        owningContextId: application._id,
        scanStatus: 'SAFE',
        reviewStatus: 'NOT_REQUIRED',
        availability: 'UNAVAILABLE',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    application.pdfFileId = file._id;
    application.pdfStatus = 'READY';
    application.pdfTemplateVersion = CA_PDF_TEMPLATE_VERSION;
    await application.save();
    await recordCaAudit({
      actorUserId: application.studentUserId,
      action: 'ca.application.pdf',
      entityType: 'CaApplication',
      entityId: application._id,
      metadata: { template: CA_PDF_TEMPLATE_VERSION },
    });
    return application;
  } catch {
    application.pdfStatus = 'FAILED';
    await application.save();
    return application;
  }
}

export async function downloadApplicationPdf(principal, applicationId, { infrastructure, config }) {
  let application = await CaApplication.findOne({ applicationId });
  if (!application) {
    throw new NotFoundError('Application not found');
  }
  const isOwner = principal.role === ROLES.STUDENT && String(application.studentUserId) === String(principal.userId);
  const isAdmin =
    principal.role === ROLES.DEPARTMENT_ADMINISTRATOR &&
    String(application.departmentId) === String(principal.departmentId);
  if (!isOwner && !isAdmin) {
    throw new NotFoundError('Application not found');
  }
  if (!application.pdfFileId || application.pdfTemplateVersion !== CA_PDF_TEMPLATE_VERSION || application.pdfStatus !== 'READY') {
    application = (await generateApplicationPdf({ applicationId, config, infrastructure })) || application;
  }
  if (!application.pdfFileId || application.pdfStatus !== 'READY') {
    throw new NotFoundError('The form could not be downloaded');
  }
  const file = await StoredFile.findById(application.pdfFileId);
  if (!file) {
    throw new NotFoundError('PDF is not available');
  }
  const object = await infrastructure.storage.getObject(file.storageKey);
  return { buffer: object.body, filename: file.displayFilename, mimeType: file.mimeType };
}
