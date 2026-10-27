const YEAR_SEQUENCES = [1, 2, 3, 4];
const SEMESTER_SEQUENCES = [1, 2];

export function assessAcademicStructure(years = [], semesters = []) {
  const activeYears = years.filter((year) => year.status === 'ACTIVE');
  const gaps = [];
  let configured = 0;

  for (const yearSequence of YEAR_SEQUENCES) {
    const matchingYears = activeYears.filter((year) => year.sequence === yearSequence);
    if (matchingYears.length !== 1) {
      const yearIssue =
        matchingYears.length === 0
          ? `Year ${yearSequence} is missing or inactive`
          : `Year ${yearSequence} has more than one active record`;
      for (const semesterSequence of SEMESTER_SEQUENCES) {
        gaps.push(`${yearIssue}; Semester ${semesterSequence} cannot be counted`);
      }
      continue;
    }
    const year = matchingYears[0];
    for (const semesterSequence of SEMESTER_SEQUENCES) {
      const matchingSemesters = semesters.filter(
        (semester) =>
          semester.status === 'ACTIVE' &&
          String(semester.academicYearId) === String(year.id) &&
          semester.sequence === semesterSequence,
      );
      if (matchingSemesters.length === 1) {
        configured += 1;
      } else if (matchingSemesters.length === 0) {
        gaps.push(`Year ${yearSequence}, Semester ${semesterSequence} is missing or inactive`);
      } else {
        gaps.push(`Year ${yearSequence}, Semester ${semesterSequence} has more than one active record`);
      }
    }
  }

  return {
    configured,
    required: 8,
    complete: configured === 8 && gaps.length === 0,
    gaps,
  };
}
