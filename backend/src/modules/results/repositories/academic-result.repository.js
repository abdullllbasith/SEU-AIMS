import { AcademicResult } from '../models/academic-result.model.js';

export function findOfficialResult(registrationNumber, subjectCode) {
  return AcademicResult.findOne({
    registrationNumber: registrationNumber.toUpperCase(),
    subjectCode: subjectCode.toUpperCase(),
  });
}
