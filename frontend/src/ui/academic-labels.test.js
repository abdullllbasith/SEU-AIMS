import { describe, expect, it } from 'vitest';
import {
  formatActiveSemestersLabel,
  formatDepartmentLead,
  formatLinkedSubjectLabel,
  formatOfferingLabel,
  formatSemesterLabel,
  formatSemesterShortName,
  formatSubjectLabel,
  formatYearLabel,
} from './academic-labels.js';

describe('academic-labels', () => {
  it('formats department lead from name without duplicating identical code', () => {
    expect(formatDepartmentLead({ name: 'ICT QA', code: 'ICT' })).toBe('ICT QA');
    expect(formatDepartmentLead({ name: 'ICT', code: 'ICT' })).toBe('ICT');
  });

  it('joins year and semester and strips matching Y{n} seed suffixes', () => {
    const year2 = { id: 'y2', name: 'Year 2', sequence: 2 };
    expect(formatSemesterLabel({ name: 'Semester 1 Y2', sequence: 1, academicYearId: 'y2' }, year2)).toBe(
      'Year 2 · Semester 1',
    );
    expect(formatSemesterShortName({ name: 'Semester 1 Y2', sequence: 1 }, year2)).toBe('Semester 1');
    expect(formatSemesterLabel({ name: 'Semester 1', sequence: 1 }, { name: 'Year 1', sequence: 1 })).toBe(
      'Year 1 · Semester 1',
    );
  });

  it('uses the subject name on the row when that subject is not in the loaded page', () => {
    const lookups = { subjects: new Map() };
    expect(
      formatLinkedSubjectLabel(
        {
          subjectId: '6aca7b88337ed90ca3142f04',
          subjectCode: 'SWT40016',
          subjectName: 'Project',
        },
        lookups,
      ),
    ).toBe('SWT40016 — Project');
  });

  it('formats subject and offering labels from real fields', () => {
    expect(formatSubjectLabel({ code: 'ICT1233', name: 'Programming' })).toBe('ICT1233 — Programming');
    expect(
      formatOfferingLabel({
        subjectCode: 'ICT1233',
        subjectName: 'Programming',
        academicYearName: 'Year 1',
        semesterName: 'Semester 1',
        batchCode: '22ICT',
      }),
    ).toContain('ICT1233 — Programming');
  });

  it('lists active semesters with year context', () => {
    const years = [
      { id: 'y1', name: 'Year 1', sequence: 1 },
      { id: 'y2', name: 'Year 2', sequence: 2 },
    ];
    const semesters = [
      { id: 's1', name: 'Semester 1', sequence: 1, academicYearId: 'y1' },
      { id: 's2', name: 'Semester 1 Y2', sequence: 1, academicYearId: 'y2' },
    ];
    expect(formatActiveSemestersLabel(semesters, years)).toEqual([
      'Year 1 · Semester 1',
      'Year 2 · Semester 1',
    ]);
    expect(formatYearLabel(years[0])).toBe('Year 1');
  });
});
