import { User } from '../../authentication/index.js';
import {
  AcademicYear,
  Batch,
  Department,
  Semester,
  Subject,
  findStudentContextByUserId,
} from '../../academic-foundation/index.js';
import { DICT_GRADE_POINTS, getOwnResults } from '../../results/index.js';
import { getStudentGpaSummary } from '../../gpa-cgpa/index.js';
import { listSubjects } from './subject-context.service.js';

const MAX_RESULT_ROWS = 120;
const TARGET_BANDS = Object.freeze([
  { gpa: 3.7, label: 'First Class' },
  { gpa: 3.3, label: 'Second Class (Upper Division)' },
  { gpa: 3.0, label: 'Second Class (Lower Division)' },
  { gpa: 2.0, label: 'Pass' },
]);
const WEAK_GRADE_POINT = 2.0;

function round2(value) {
  return Math.round(value * 100) / 100;
}

function clean(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/** What the student needs next semester to reach each class band they have not reached yet. */
function describeTargets({ cgpa, credits, nextCredits }) {
  if (!Number.isFinite(cgpa) || !(credits > 0) || !(nextCredits > 0)) {
    return [];
  }
  const qualityPoints = cgpa * credits;
  const lines = [];
  for (const band of TARGET_BANDS) {
    if (cgpa >= band.gpa) {
      continue;
    }
    const needed = (band.gpa * (credits + nextCredits) - qualityPoints) / nextCredits;
    lines.push(
      needed > 4
        ? `- ${band.label} (CGPA ${band.gpa.toFixed(2)}): cannot be reached in one semester of ${nextCredits} credits; it needs several semesters of strong grades.`
        : `- ${band.label} (CGPA ${band.gpa.toFixed(2)}): needs a semester GPA of about ${round2(Math.max(needed, 0)).toFixed(2)} across ${nextCredits} credits.`,
    );
  }
  return lines;
}

/**
 * A plain-text snapshot of the signed-in student's own record: identity, current semester subjects,
 * results and GPA. Every query is keyed on `principal.userId`, so this can never contain another
 * student's data; the prompt repeats that rule for the model.
 * Returns '' when nothing can be loaded, so a failure here never blocks an answer.
 */
export async function buildStudentRecord(principal) {
  try {
    const context = await findStudentContextByUserId(principal.userId);
    if (!context || context.status !== 'ACTIVE') {
      return '';
    }
    const [user, department, batch, year, semester, subjects, results, gpa] = await Promise.all([
      User.findById(principal.userId).select('displayName'),
      Department.findById(context.departmentId).select('code name'),
      Batch.findById(context.batchId).select('code name'),
      AcademicYear.findById(context.currentAcademicYearId).select('name'),
      Semester.findById(context.currentSemesterId).select('name'),
      listSubjects(principal),
      getOwnResults(principal),
      getStudentGpaSummary(principal.userId),
    ]);

    const codes = [...new Set([...subjects.map((item) => item.subjectCode), ...results.all.map((item) => item.subjectCode)])];
    const catalog = codes.length
      ? await Subject.find({ departmentId: context.departmentId, code: { $in: codes } }).select('code credits countsForGpa')
      : [];
    const byCode = new Map(catalog.map((item) => [item.code, item]));
    const creditsOf = (code) => byCode.get(code)?.credits;

    const lines = ['Student profile (the signed-in student only):'];
    lines.push(`- Name: ${clean(user?.displayName) || 'not set'}`);
    lines.push(`- Registration number: ${context.registrationNumber}`);
    lines.push(`- Department: ${department ? `${department.name} (${department.code})` : 'unknown'}`);
    lines.push(`- Batch: ${batch ? clean(batch.name || batch.code) : 'unknown'}`);
    lines.push(`- Current period: ${[year?.name, semester?.name].filter(Boolean).join(', ') || 'unknown'}`);
    if (context.specialization) {
      lines.push(`- Specialization: ${context.specialization}`);
    }

    lines.push('', 'Subjects offered to this student this semester (what they can study now):');
    let nextCredits = 0;
    if (subjects.length) {
      for (const item of subjects) {
        const credits = creditsOf(item.subjectCode);
        if (Number.isFinite(credits) && byCode.get(item.subjectCode)?.countsForGpa !== false) {
          nextCredits += credits;
        }
        lines.push(`- ${item.subjectCode} ${item.subjectName}${Number.isFinite(credits) ? ` (${credits} credits)` : ''}`);
      }
    } else {
      lines.push('- None are offered to this student right now.');
    }

    lines.push('', 'GPA:');
    const hasGpa = gpa.status === 'CURRENT' && Number.isFinite(gpa.cgpa) && gpa.credits > 0;
    if (hasGpa) {
      lines.push(`- CGPA: ${gpa.cgpa.toFixed(2)} over ${gpa.credits} credits${gpa.classification ? `, currently ${gpa.classification}` : ''}`);
      const periodNames = new Map(
        results.periods.map((period) => [`${period.academicYearId}|${period.semesterId}`, [period.academicYearName, period.semesterName].filter(Boolean).join(' ')]),
      );
      for (const item of gpa.semesters) {
        const name = periodNames.get(`${item.academicYearId}|${item.semesterId}`) || 'Semester';
        lines.push(`- ${name}: GPA ${Number(item.gpa).toFixed(2)} (${item.credits} credits)`);
      }
    } else {
      lines.push('- Not available yet (no published results, or the GPA is being recalculated).');
    }

    lines.push('', 'Results by semester:');
    let rows = 0;
    const weak = [];
    for (const period of results.periods) {
      const heading = [period.academicYearName, period.semesterName].filter(Boolean).join(' ') || 'Semester';
      lines.push(`${heading}${period.current ? ' (current)' : ''}:`);
      for (const row of period.results) {
        if (rows >= MAX_RESULT_ROWS) {
          break;
        }
        rows += 1;
        const credits = creditsOf(row.subjectCode);
        lines.push(`- ${row.subjectCode}: ${row.resultCode}${Number.isFinite(credits) ? ` (${credits} credits)` : ''}`);
        const point = DICT_GRADE_POINTS[row.resultCode];
        if (point !== undefined && point < WEAK_GRADE_POINT && Number.isFinite(credits)) {
          weak.push({ code: row.subjectCode, grade: row.resultCode, credits });
        }
      }
    }
    if (!rows) {
      lines.push('- No published results yet.');
    }

    if (hasGpa) {
      lines.push('', 'Improvement facts (computed by the system from the official GPA rules; use these numbers, do not recompute):');
      if (weak.length) {
        lines.push(`- Grades below C that drag the CGPA down: ${weak.map((item) => `${item.code} (${item.grade}, ${item.credits} credits)`).join(', ')}. Repeating them is the fastest way to raise the CGPA.`);
      }
      const targets = describeTargets({ cgpa: gpa.cgpa, credits: gpa.credits, nextCredits });
      if (targets.length) {
        lines.push('- Targets for next semester, assuming the same credit load as this semester:', ...targets);
      } else if (!weak.length) {
        lines.push('- The student is already in the top band; the advice is to keep the grades steady.');
      }
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}
