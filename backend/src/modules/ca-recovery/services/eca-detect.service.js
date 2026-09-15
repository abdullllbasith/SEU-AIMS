import { AcademicResult } from '../../results/models/academic-result.model.js';
import { syncIncompleteCaFromResult } from './eca-from-results.js';

/**
 * Worker re-sync. Authoritative facts are reloaded from Results, not trusted from the job payload.
 */
export async function processEcaDetectJob({ studentUserId, importId } = {}) {
  const filter = {};
  if (studentUserId) {
    filter.studentUserId = studentUserId;
  }
  if (importId) {
    filter.sourceImportId = importId;
  }
  if (!filter.studentUserId && !filter.sourceImportId) {
    return { processed: 0 };
  }
  const results = await AcademicResult.find(filter);
  for (const result of results) {
    await syncIncompleteCaFromResult(result);
  }
  return { processed: results.length };
}
