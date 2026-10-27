import { describe, expect, it } from 'vitest';
import { offeringLabel } from './lecturer-api.js';

describe('lecturer offering labels', () => {
  it('uses academic names rather than raw ids when present', () => {
    expect(
      offeringLabel({
        subjectCode: 'ICT1233',
        subjectName: 'Programming',
        batchName: '22 batch',
        academicYearName: 'Year 1',
        semesterName: 'Semester 1',
      }),
    ).toBe('ICT1233 — Programming (22 batch · Year 1 · Semester 1)');
  });
});
