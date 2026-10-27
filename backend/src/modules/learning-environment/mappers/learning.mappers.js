function id(value) {
  if (!value) {
    return null;
  }
  return String(value._id || value);
}

export function mapSection(doc) {
  return {
    id: id(doc),
    subjectOfferingId: id(doc.subjectOfferingId),
    name: doc.name,
    sortOrder: doc.sortOrder,
  };
}

export function mapResource(doc, { file, includeOperational = false } = {}) {
  const payload = {
    id: id(doc),
    subjectOfferingId: id(doc.subjectOfferingId),
    sectionId: id(doc.sectionId),
    title: doc.title,
    description: doc.description || '',
    category: doc.category,
    publicationState: doc.publicationState,
    sortOrder: doc.sortOrder,
    version: doc.version,
    deadlineAt: doc.deadlineAt || null,
    publishedAt: doc.publishedAt || null,
    updatedAt: doc.updatedAt,
    displayFilename: file?.displayFilename,
    sizeBytes: file?.sizeBytes,
    mimeType: file?.mimeType,
  };

  if (includeOperational) {
    payload.fileId = id(doc.fileId);
    payload.scanStatus = file?.scanStatus;
    payload.availability = file?.availability;
    payload.deletedAt = doc.deletedAt || null;
  }

  return payload;
}

export function mapOfferingSummary(offering, extras = {}) {
  const subject = offering.subjectId;
  return {
    id: id(offering),
    subjectCode: subject?.code || extras.subjectCode,
    subjectName: subject?.name || extras.subjectName,
    batchId: id(offering.batchId),
    academicYearId: id(offering.academicYearId),
    semesterId: id(offering.semesterId),
    status: offering.status,
    ...extras,
  };
}
