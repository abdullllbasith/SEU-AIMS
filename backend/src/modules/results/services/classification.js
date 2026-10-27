/**
 * Post-parse classification helpers. Official identity stays registration number + subject code.
 * Conflicting duplicates block every row of that identity. Nothing here picks a grade.
 */

export function actionForExistingResult(existingResultCode, incomingResultCode) {
  if (!existingResultCode) {
    return 'NEW';
  }
  if (existingResultCode === incomingResultCode) {
    return 'UNCHANGED';
  }
  return 'UPDATE';
}

export function blockConflictingIdentities(rows) {
  const conflictKeys = new Set();
  for (const row of rows) {
    if ((row.validationErrors || []).includes('INTRA_IMPORT_CONFLICT')) {
      conflictKeys.add(`${row.registrationNumber}|${row.subjectCode}`);
    }
  }
  if (!conflictKeys.size) {
    return rows.slice();
  }
  return rows.map((row) => {
    const key = `${row.registrationNumber}|${row.subjectCode}`;
    if (!conflictKeys.has(key)) {
      return row;
    }
    const errors = row.validationErrors || [];
    return {
      ...row,
      rowStatus: 'BLOCKED',
      proposedAction: 'SKIP',
      validationErrors: errors.includes('INTRA_IMPORT_CONFLICT') ? errors : [...errors, 'INTRA_IMPORT_CONFLICT'],
    };
  });
}
