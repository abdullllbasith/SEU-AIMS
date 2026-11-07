/**
 * Public API for the results module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'results';
export const API_PREFIX = '/api/results';

export function createResultsModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { ResultImport } from './models/result-import.model.js';
export { ResultImportRow } from './models/result-import-row.model.js';
export { AcademicResult } from './models/academic-result.model.js';
export { ResultRevision } from './models/result-revision.model.js';
export { findOfficialResult } from './repositories/academic-result.repository.js';
export { processResultParse } from './services/import.service.js';
export { getOwnResults } from './services/student-results.service.js';
export { DICT_GRADE_POINTS, ECA_RESULT_CODE } from './constants.js';
export { applyOfficialResultChange, OFFICIAL_RESULT_CHANGE_KINDS } from './services/official-result-writer.js';
export { evaluateRepeatCap, CAP_TREATMENTS } from './services/grade-cap.js';
