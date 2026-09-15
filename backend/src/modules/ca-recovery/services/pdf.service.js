import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { StoredFile } from '../../files/index.js';
import { CaApplication } from '../models/ca-application.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';
import { IncompleteCa } from '../models/incomplete-ca.model.js';
import { User } from '../../authentication/models/user.model.js';
import { CA_PDF_TEMPLATE_VERSION } from '../constants.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { recordCaAudit } from './notify.js';

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
  if (application.pdfStatus === 'READY' && application.pdfFileId) {
    return application;
  }
  application.pdfStatus = 'GENERATING';
  await application.save();
  try {
    const student = await User.findById(application.studentUserId);
    const links = await CaApplicationSubject.find({ applicationId: application._id });
    const conditions = await IncompleteCa.find({ _id: { $in: links.map((item) => item.incompleteCaId) } });
    const publicUrl = config?.api?.publicUrl || 'http://localhost:3001';
    const verifyUrl = `${publicUrl}/api/ca/verify/${application.qrVerificationToken}`;
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let y = 800;
    const line = (text, size = 12, useBold = false) => {
      page.drawText(String(text), { x: 50, y, size, font: useBold ? bold : font, color: rgb(0.07, 0.12, 0.16) });
      y -= size + 8;
    };
    line('CA Recovery Application', 18, true);
    line(`Template ${CA_PDF_TEMPLATE_VERSION}`, 10);
    line(`Application ID: ${application.applicationId}`);
    line(`Registration number: ${application.registrationNumber}`);
    line(`Student: ${student?.displayName || student?.email || ''}`);
    line(`Submitted: ${application.submittedAt ? application.submittedAt.toISOString() : ''}`);
    line('Affected subject codes:', 12, true);
    for (const condition of conditions) {
      line(`- ${condition.subjectCode}`);
    }
    line('Physical HOD signature is obtained on the printed copy. This PDF is not a digital signature.');
    const png = await qrPng(verifyUrl);
    if (png) {
      const image = await pdf.embedPng(png);
      page.drawImage(image, { x: 50, y: Math.max(80, y - 170), width: 120, height: 120 });
    }
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

export async function downloadApplicationPdf(principal, applicationId, { infrastructure }) {
  const application = await CaApplication.findOne({ applicationId });
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
  if (!application.pdfFileId) {
    throw new NotFoundError('PDF is not available');
  }
  const file = await StoredFile.findById(application.pdfFileId);
  if (!file) {
    throw new NotFoundError('PDF is not available');
  }
  const object = await infrastructure.storage.getObject(file.storageKey);
  return { buffer: object.body, filename: file.displayFilename, mimeType: file.mimeType };
}
