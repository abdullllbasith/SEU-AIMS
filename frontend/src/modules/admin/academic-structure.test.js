import { describe, expect, it } from 'vitest';
import { assessAcademicStructure } from './academic-structure.js';

function period(id, sequence, status = 'ACTIVE', academicYearId) {
  return academicYearId
    ? { id, sequence, status, academicYearId }
    : { id, sequence, status };
}

describe('assessAcademicStructure', () => {
  it('counts a complete active four-year structure as 8/8', () => {
    const years = [1, 2, 3, 4].map((sequence) => period(`y${sequence}`, sequence));
    const semesters = years.flatMap((year) => [
      period(`${year.id}-s1`, 1, 'ACTIVE', year.id),
      period(`${year.id}-s2`, 2, 'ACTIVE', year.id),
    ]);
    const result = assessAcademicStructure(years, semesters);
    expect(result).toMatchObject({ configured: 8, required: 8, complete: true, gaps: [] });
  });

  it('ignores archived periods and reports the missing slots', () => {
    const years = [period('y1', 1), period('y1-old', 1, 'ARCHIVED')];
    const semesters = [period('s1', 1, 'ACTIVE', 'y1'), period('s2', 2, 'ARCHIVED', 'y1')];
    const result = assessAcademicStructure(years, semesters);
    expect(result.configured).toBe(1);
    expect(result.complete).toBe(false);
    expect(result.gaps.join(' ')).toContain('Year 1, Semester 2');
    expect(result.gaps.join(' ')).toContain('Year 2');
    expect(result.gaps).toHaveLength(7);
  });

  it('matches the verified ICT department fixture at 3/8 with create still required', () => {
    const years = [period('y1', 1, 'ACTIVE'), period('y2', 2, 'ACTIVE')];
    const semesters = [
      period('y1s1', 1, 'ARCHIVED', 'y1'),
      period('y1s2', 2, 'ACTIVE', 'y1'),
      period('y2s1', 1, 'ACTIVE', 'y2'),
      period('y2s2', 2, 'ACTIVE', 'y2'),
    ];
    const result = assessAcademicStructure(years, semesters);
    expect(result.configured).toBe(3);
    expect(result.required).toBe(8);
    expect(result.complete).toBe(false);
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        'Year 1, Semester 1 is missing or inactive',
        expect.stringContaining('Year 3'),
        expect.stringContaining('Year 4'),
      ]),
    );
    expect(result.gaps).toHaveLength(5);
  });

  it('keeps complete false when a required year is inactive even if semesters exist', () => {
    const years = [
      period('y1', 1, 'ARCHIVED'),
      period('y2', 2),
      period('y3', 3),
      period('y4', 4),
    ];
    const semesters = years.flatMap((year) => [
      period(`${year.id}-s1`, 1, 'ACTIVE', year.id),
      period(`${year.id}-s2`, 2, 'ACTIVE', year.id),
    ]);
    const result = assessAcademicStructure(years, semesters);
    expect(result.configured).toBe(6);
    expect(result.complete).toBe(false);
  });
});
