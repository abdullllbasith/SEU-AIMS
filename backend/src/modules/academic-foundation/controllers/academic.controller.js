import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import * as academicService from '../services/academic.service.js';
import * as enrollmentService from '../services/enrollment.service.js';
import * as catalogImportService from '../services/catalog-import.service.js';

export function createAcademicController() {
  return {
    overview: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.getOverview(req.principal));
    }),
    reconciliation: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.reconcileAcademicFoundation(req.principal));
    }),
    listDepartments: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.listDepartments(req.principal));
    }),
    createDepartment: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.createDepartment(req.principal, req.body || {}), {
        statusCode: 201,
      });
    }),
    updateDepartment: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await academicService.updateDepartment(req.principal, req.params.departmentId, req.body || {}),
      );
    }),
    listBatches: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.listBatches(req.principal, req.query));
    }),
    createBatch: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.createBatch(req.principal, req.body || {}), { statusCode: 201 });
    }),
    getBatch: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.getBatch(req.principal, req.params.batchId));
    }),
    assignBatchAcademicContext: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await academicService.assignBatchAcademicContext(req.principal, req.params.batchId, req.body || {}),
      );
    }),
    reviseBatchAcademicContext: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await academicService.reviseBatchAcademicContext(req.principal, req.params.batchId, req.body || {}),
      );
    }),
    updateBatch: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.updateBatch(req.principal, req.params.batchId, req.body || {}));
    }),
    listAcademicYears: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.listAcademicYears(req.principal, req.query));
    }),
    createAcademicYear: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.createAcademicYear(req.principal, req.body || {}), {
        statusCode: 201,
      });
    }),
    updateAcademicYear: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await academicService.updateAcademicYear(req.principal, req.params.yearId, req.body || {}),
      );
    }),
    deleteAcademicYear: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.deleteAcademicYear(req.principal, req.params.yearId));
    }),
    listSemesters: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.listSemesters(req.principal, req.query));
    }),
    createSemester: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.createSemester(req.principal, req.body || {}), {
        statusCode: 201,
      });
    }),
    updateSemester: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await academicService.updateSemester(req.principal, req.params.semesterId, req.body || {}),
      );
    }),
    deleteSemester: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.deleteSemester(req.principal, req.params.semesterId));
    }),
    listSubjects: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.listSubjects(req.principal, req.query));
    }),
    createSubject: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.createSubject(req.principal, req.body || {}), { statusCode: 201 });
    }),
    updateSubject: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await academicService.updateSubject(req.principal, req.params.subjectId, req.body || {}),
      );
    }),
    listOfferings: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.listOfferings(req.principal, req.query));
    }),
    createOffering: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.createOffering(req.principal, req.body || {}), {
        statusCode: 201,
      });
    }),
    assignPeriodOfferings: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.assignPeriodOfferings(req.principal, req.body || {}));
    }),
    getOffering: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.getOffering(req.principal, req.params.offeringId));
    }),
    updateOffering: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await academicService.updateOffering(req.principal, req.params.offeringId, req.body || {}),
      );
    }),
    listOfferingEnrollments: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await enrollmentService.listOfferingEnrollments(req.principal, req.params.offeringId, req.query),
      );
    }),
    createOfferingEnrollment: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await enrollmentService.createOfferingEnrollment(req.principal, req.params.offeringId, req.body || {}),
        { statusCode: 201 },
      );
    }),
    listStudentEnrollments: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await enrollmentService.listStudentEnrollments(req.principal, req.params.contextId, req.query),
      );
    }),
    cancelEnrollment: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await enrollmentService.cancelEnrollment(req.principal, req.params.enrollmentId, req.body || {}),
      );
    }),
    previewCatalogImport: asyncHandler(async (req, res) => {
      sendSuccess(res, await catalogImportService.previewCatalogImport(req.principal));
    }),
    commitCatalogImport: asyncHandler(async (req, res) => {
      sendSuccess(res, await catalogImportService.commitCatalogImport(req.principal));
    }),
    listCurriculumMappings: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.listCurriculumMappings(req.principal, req.query));
    }),
    createCurriculumMapping: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.createCurriculumMapping(req.principal, req.body || {}), {
        statusCode: 201,
      });
    }),
    updateCurriculumMapping: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await academicService.updateCurriculumMapping(req.principal, req.params.mappingId, req.body || {}),
      );
    }),
    previewBatchOfferings: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.previewBatchOfferings(req.principal, req.params.batchId));
    }),
    generateBatchOfferings: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.generateBatchOfferings(req.principal, req.params.batchId));
    }),
    previewBatchProgression: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.previewBatchProgression(req.principal, req.params.batchId));
    }),
    progressBatch: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.progressBatch(req.principal, req.params.batchId, req.body || {}));
    }),
    listMembers: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.listMembers(req.principal, req.query));
    }),
    setLecturerVerification: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await academicService.setLecturerVerification(req.principal, req.params.userId, req.body || {}),
      );
    }),
    listAssignments: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.listAssignments(req.principal, req.query));
    }),
    assignLecturer: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.assignLecturer(req.principal, req.body || {}), {
        statusCode: 201,
      });
    }),
    revokeAssignment: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.revokeAssignment(req.principal, req.params.assignmentId));
    }),
    listStudentContexts: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.listStudentContexts(req.principal, req.query));
    }),
    createStudentContext: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.createStudentContext(req.principal, req.body || {}), {
        statusCode: 201,
      });
    }),
    getStudentContext: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.getStudentContextForAdmin(req.principal, req.params.contextId));
    }),
    updateStudentContext: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await academicService.updateStudentContext(req.principal, req.params.contextId, req.body || {}),
      );
    }),
    deleteStudentContext: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.deleteStudentContext(req.principal, req.params.contextId));
    }),
    myContext: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.getMyContext(req.principal));
    }),
    myOfferings: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.getMyOfferings(req.principal));
    }),
  };
}
