import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import * as academicService from '../services/academic.service.js';

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
    getOffering: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.getOffering(req.principal, req.params.offeringId));
    }),
    updateOffering: asyncHandler(async (req, res) => {
      sendSuccess(
        res,
        await academicService.updateOffering(req.principal, req.params.offeringId, req.body || {}),
      );
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
    myContext: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.getMyContext(req.principal));
    }),
    myOfferings: asyncHandler(async (req, res) => {
      sendSuccess(res, await academicService.getMyOfferings(req.principal));
    }),
  };
}
