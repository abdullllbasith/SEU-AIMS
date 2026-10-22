import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { academicApi } from './academic-api.js';
import { CatalogImportPanel } from './CatalogImportPanel.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import { assessAcademicStructure } from './academic-structure.js';
import {
  formatBatchLabel,
  formatOfferingLabel,
  formatSemesterLabel,
  formatLinkedSubjectLabel,
  formatSemesterShortName,
  formatSubjectLabel,
  formatYearLabel,
  indexById,
} from '../../ui/academic-labels.js';

const OVERVIEW_ICONS = {
  batches: 'batches',
  academicYears: 'years',
  semesters: 'semesters',
  subjects: 'subjects',
  curriculumMappings: 'subjects',
  subjectOfferings: 'offerings',
  lecturers: 'lecturers',
  activeAssignments: 'assignments',
  studentContexts: 'students',
  activeBatches: 'batches',
  activeSemesters: 'semesters',
  activeStudents: 'students',
  activeLecturers: 'lecturers',
};

const TABS = [
  'Overview',
  'Department',
  'Batches',
  'Years',
  'Semesters',
  'Subjects',
  'Curriculum',
  'Offerings',
  'Lecturers',
  'Assignments',
  'Students',
];

const COLUMN_LABELS = {
  code: 'Code',
  name: 'Name',
  status: 'Status',
  sequence: 'Sequence',
  credits: 'Credits',
  academicYearId: 'Academic year',
  subjectId: 'Subject',
  batchId: 'Batch',
  semesterId: 'Semester',
  specialization: 'Specialization',
  email: 'Email',
  accountStatus: 'Account',
  lecturerStatus: 'Lecturer',
  registrationNumber: 'Registration number',
  currentAcademicYearId: 'Year',
  currentSemesterId: 'Semester',
  lecturerUserId: 'Lecturer',
  subjectOfferingId: 'Offering',
  isActive: 'Active',
};

function Field({ label, children }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}

function ErrorBanner({ error }) {
  if (!error) {
    return null;
  }
  return (
    <p className="form-error" role="alert">
      {error}
    </p>
  );
}

function Pager({ page, pageSize, total, onPage }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span className="pager__meta">
        Page {page} of {last} ({total} records)
      </span>
      <span className="stack-item__actions">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" disabled={page >= last} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </div>
  );
}

function statusPillClass(value) {
  const text = String(value ?? '').toUpperCase();
  if (text === 'ACTIVE' || text === 'VERIFIED' || text === 'TRUE') {
    return 'status-pill status-pill--ok';
  }
  if (text === 'ARCHIVED' || text === 'SUSPENDED' || text === 'FALSE' || text === 'DISABLED') {
    return 'status-pill status-pill--danger';
  }
  if (text === 'PENDING' || text === 'UNVERIFIED') {
    return 'status-pill status-pill--pending';
  }
  return 'status-pill';
}

function cellValue(column, value, lookups = {}, row = null) {
  if (column === 'status' || column === 'accountStatus' || column === 'lecturerStatus') {
    return <span className={statusPillClass(value)}>{String(value ?? '—')}</span>;
  }
  if (column === 'isActive') {
    return <span className={statusPillClass(value)}>{value ? 'Active' : 'Inactive'}</span>;
  }
  if (column === 'academicYearId') {
    const year = lookups.years?.get?.(String(value));
    return year ? formatYearLabel(year) : String(value ?? '—');
  }
  if (column === 'semesterId' || column === 'currentSemesterId') {
    const semester = lookups.semesters?.get?.(String(value));
    const year = lookups.years?.get?.(String(semester?.academicYearId));
    return semester ? formatSemesterLabel(semester, year) : String(value ?? '—');
  }
  if (column === 'batchId') {
    const batch = lookups.batches?.get?.(String(value));
    return batch ? formatBatchLabel(batch) : String(value ?? '—');
  }
  if (column === 'specialization') {
    return value ? String(value) : 'Common';
  }
  if (column === 'subjectId') {
    const label = formatLinkedSubjectLabel({ ...(row || {}), subjectId: value }, lookups);
    return label || String(value ?? '—');
  }
  if (column === 'currentAcademicYearId') {
    const year = lookups.years?.get?.(String(value));
    return year ? formatYearLabel(year) : String(value ?? '—');
  }
  // Semester list Name column: strip seed " Y2" when year is already shown beside it.
  if (column === 'name' && row?.academicYearId) {
    const year = lookups.years?.get?.(String(row.academicYearId));
    return (
      formatSemesterShortName({ name: value, sequence: row.sequence }, year) || String(value ?? '—')
    );
  }
  return String(value ?? '');
}

function confirmArchive(label) {
  return window.confirm(
    `Archive this ${label}? Existing history, results, and offerings stay linked to this record. Archive is refused when an active batch is in this period or needs it for the next progression step.`,
  );
}

function confirmRestore(label) {
  return window.confirm(`Restore this ${label} to ACTIVE?`);
}

function confirmDelete(label) {
  return window.confirm(
    `Permanently delete this archived ${label}? This is refused while batches, students, offerings, curriculum, history, or official results still reference it.`,
  );
}

async function collectSubjects() {
  const pageSize = 50;
  const first = await academicApi.subjects({ status: 'ALL', page: 1, pageSize });
  const items = [...(first.data?.items || [])];
  const total = first.data?.total ?? items.length;
  const size = first.data?.pageSize || pageSize;
  const pages = Math.max(1, Math.ceil(total / size));
  for (let page = 2; page <= pages; page += 1) {
    const next = await academicApi.subjects({ status: 'ALL', page, pageSize: size });
    items.push(...(next.data?.items || []));
  }
  return items.sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')));
}

function cleanFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

const STRUCTURE_COPY =
  'Academic years and semesters are shared by every batch in this department. They are part of department setup, not a new intake. Create a new intake on the Batches tab. Move a batch to the next semester from that batch’s progression panel.';

function StructureStatus({ years, semesters, listsComplete }) {
  if (!listsComplete) {
    return (
      <p className="panel-lead">
        Academic structure status is unavailable until the year and semester lists finish loading.
      </p>
    );
  }
  const structure = assessAcademicStructure(years, semesters);
  return (
    <>
      <p className="panel-lead">{STRUCTURE_COPY}</p>
      <p className="figure-line" role="status">
        Academic structure: {structure.configured}/{structure.required} periods configured
      </p>
      {structure.complete ? (
        <p className="panel-lead">
          All eight active periods are in place (Year 1–4, two semesters each). New year and semester records are not
          needed. Creating another period with the same sequence is rejected.
        </p>
      ) : (
        <p className="panel-lead">
          The shared structure is incomplete or has an inactive required period. Create only the missing active periods.
          Archived rows stay in the list and do not count as configured.
          {structure.gaps.length ? ` ${structure.gaps.join('. ')}.` : ''}
        </p>
      )}
    </>
  );
}

export function AcademicAdminPage() {
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [department, setDepartment] = useState(null);
  const [batches, setBatches] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [years, setYears] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [semesters, setSemesters] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [subjects, setSubjects] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [curriculum, setCurriculum] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [offerings, setOfferings] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [lecturers, setLecturers] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [assignments, setAssignments] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [students, setStudents] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [studentUsers, setStudentUsers] = useState([]);
  const [subjectCatalog, setSubjectCatalog] = useState([]);
  const [listFilters, setListFilters] = useState({ curriculum: {}, offerings: {} });
  const [search, setSearch] = useState('');
  const [checks, setChecks] = useState(null);

  const lookups = useMemo(
    () => ({
      years: indexById(years.items),
      semesters: indexById(semesters.items),
      batches: indexById(batches.items),
      subjects: indexById(subjectCatalog.length ? subjectCatalog : subjects.items),
    }),
    [years.items, semesters.items, batches.items, subjectCatalog, subjects.items],
  );

  const run = useCallback(async (fn) => {
    setError('');
    try {
      return await fn();
    } catch (caught) {
      setError(caught.message || 'Request failed');
      return null;
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await run(async () => {
      const [overviewRes, departmentsRes] = await Promise.all([
        academicApi.overview().catch((caught) => {
          if (caught.status === 400) {
            return { data: { department: null, counts: {} } };
          }
          throw caught;
        }),
        academicApi.departments(),
      ]);
      const dept = departmentsRes.data.items[0] || null;
      const [batchRes, yearRes, semesterRes, subjectRes, curriculumRes, offeringRes, lecturerRes, assignmentRes, studentRes, studentUserRes] =
        dept
          ? await Promise.all([
              academicApi.batches({ q: search, status: 'ALL', pageSize: 50 }),
              academicApi.years({ status: 'ALL', pageSize: 50 }),
              academicApi.semesters({ status: 'ALL', pageSize: 50 }),
              academicApi.subjects({ q: search, status: 'ALL', pageSize: 50 }),
              academicApi.curriculum({ status: 'ALL', pageSize: 50 }),
              academicApi.offerings({ status: 'ALL', pageSize: 50 }),
              academicApi.members({ role: 'LECTURER', pageSize: 50 }),
              academicApi.assignments({ active: 'true', pageSize: 50 }),
              academicApi.students({ q: search, status: 'ALL', pageSize: 50 }),
              academicApi.members({ role: 'STUDENT', pageSize: 50 }),
            ])
          : [];
      return {
        overview: overviewRes.data,
        dept,
        batchRes,
        yearRes,
        semesterRes,
        subjectRes,
        curriculumRes,
        offeringRes,
        lecturerRes,
        assignmentRes,
        studentRes,
        studentUserRes,
        subjectCatalog: dept ? await collectSubjects() : [],
      };
    });
    if (result) {
      setOverview(result.overview);
      setDepartment(result.dept);
      if (result.dept) {
        setBatches(result.batchRes.data);
        setYears(result.yearRes.data);
        setSemesters(result.semesterRes.data);
        setSubjects(result.subjectRes.data);
        setCurriculum(result.curriculumRes.data);
        setOfferings(result.offeringRes.data);
        setLecturers(result.lecturerRes.data);
        setAssignments(result.assignmentRes.data);
        setStudents(result.studentRes.data);
        setStudentUsers(result.studentUserRes.data.items);
        setSubjectCatalog(result.subjectCatalog);
      }
    }
    setLoading(false);
  }, [run, search]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadPage = useCallback(
    async (kind, page, filters) => {
      if (!department) {
        return;
      }
      const pageSize = 50;
      const nextFilters = filters ? cleanFilters(filters) : cleanFilters(listFilters[kind]);
      if (filters) {
        setListFilters((current) => ({ ...current, [kind]: nextFilters }));
      }
      const result = await run(async () => {
        if (kind === 'batches') {
          return academicApi.batches({ q: search, status: 'ALL', page, pageSize });
        }
        if (kind === 'years') {
          return academicApi.years({ status: 'ALL', page, pageSize });
        }
        if (kind === 'semesters') {
          return academicApi.semesters({ status: 'ALL', page, pageSize });
        }
        if (kind === 'subjects') {
          return academicApi.subjects({ q: search, status: 'ALL', page, pageSize });
        }
        if (kind === 'curriculum') {
          return academicApi.curriculum({ status: 'ALL', page, pageSize, ...nextFilters });
        }
        if (kind === 'offerings') {
          return academicApi.offerings({ status: 'ALL', page, pageSize, ...nextFilters });
        }
        if (kind === 'lecturers') {
          return academicApi.members({ role: 'LECTURER', page, pageSize });
        }
        if (kind === 'assignments') {
          return academicApi.assignments({ active: 'true', page, pageSize });
        }
        if (kind === 'students') {
          return academicApi.students({ q: search, status: 'ALL', page, pageSize });
        }
        return null;
      });
      if (!result?.data) {
        return;
      }
      if (kind === 'batches') setBatches(result.data);
      if (kind === 'years') setYears(result.data);
      if (kind === 'semesters') setSemesters(result.data);
      if (kind === 'subjects') setSubjects(result.data);
      if (kind === 'curriculum') setCurriculum(result.data);
      if (kind === 'offerings') setOfferings(result.data);
      if (kind === 'lecturers') setLecturers(result.data);
      if (kind === 'assignments') setAssignments(result.data);
      if (kind === 'students') setStudents(result.data);
    },
    [department, listFilters, run, search],
  );

  async function archive(label, fn) {
    if (!confirmArchive(label)) {
      return;
    }
    await run(fn);
    await reload();
  }

  async function restore(label, fn) {
    if (!confirmRestore(label)) {
      return;
    }
    await run(fn);
    await reload();
  }

  async function removeRecord(label, fn) {
    if (!confirmDelete(label)) {
      return;
    }
    await run(fn);
    await reload();
  }

  const countEntries = overview?.counts ? Object.entries(overview.counts) : [];
  const listsComplete = !loading && Boolean(department);
  const structure = assessAcademicStructure(years.items, semesters.items);
  const structureComplete = listsComplete && structure.complete;

  if (loading && !overview) {
    return <PageSkeleton title="Academic administration" variant="detail" stats={8} />;
  }

  return (
    <section className="admin-page record-page">
      <PageHeader
        title="Academic administration"
        purpose="Manage department structure, the shared curriculum, offerings, lecturers, and student academic membership. Archive keeps history; records are not deleted."
        actions={
          <button type="button" onClick={() => reload()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      <nav className="tab-nav" aria-label="Academic admin sections">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            className={tab === item ? 'tab-nav__tab is-active' : 'tab-nav__tab'}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <ErrorBanner error={error} />

      {tab === 'Overview' ? (
        <div className="admin-tab-panel">
          {!department ? (
            <p className="status-banner" role="status">
              No department is configured yet. Create one in the <strong>Department</strong> tab.
            </p>
          ) : null}

          {department ? <CatalogImportPanel /> : null}

          {countEntries.length ? (
            <div className="stat-row">
              {countEntries.slice(0, 9).map(([key, value]) => (
                <StatCard
                  key={key}
                  label={key.replace(/([A-Z])/g, ' $1')}
                  value={value}
                  icon={OVERVIEW_ICONS[key] || 'academic'}
                />
              ))}
            </div>
          ) : null}

          {department ? (
            <Panel title="Record checks" kicker="Diagnostic only">
              <p className="panel-lead">
                Run reconciliation against academic foundation data. This view does not repair records.
              </p>
              <div className="panel-actions">
                <button
                  type="button"
                  onClick={() =>
                    run(() => academicApi.reconciliation()).then((response) => {
                      if (response) {
                        setChecks(response.data);
                      }
                    })
                  }
                >
                  Check academic records
                </button>
              </div>
              {checks ? (
                <div className="panel-subsection">
                  <p className="panel-lead">{checks.note}</p>
                  <p className="figure-line">
                    {checks.issueCount}
                    <span className="figure-line__hint">
                      {' '}
                      issue{checks.issueCount === 1 ? '' : 's'}
                    </span>
                  </p>
                  {checks.issues?.length ? (
                    <ul className="stack-list">
                      {checks.issues.map((item) => (
                        <li key={`${item.issue}-${item.entityId}`}>
                          <span className="stack-item__title">{item.issue}</span>
                          <span className="stack-item__meta">{item.recommendedAction}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="deadline-empty">No issues reported.</p>
                  )}
                </div>
              ) : null}
            </Panel>
          ) : null}
        </div>
      ) : null}

      {tab === 'Department' ? (
        <div className="admin-crud">
          <Panel title={department ? 'Department profile' : 'Create department'} kicker={department ? department.code : 'Required first'}>
            {department ? (
              <form
                className="settings-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.target);
                  await run(() =>
                    academicApi.updateDepartment(department.id, {
                      name: form.get('name'),
                      description: form.get('description'),
                    }),
                  );
                  await reload();
                }}
              >
                <p className="panel-lead">
                  Code <strong>{department.code}</strong> is immutable.{' '}
                  <span className={statusPillClass(department.status)}>{department.status}</span>
                </p>
                <Field label="Name">
                  <input name="name" defaultValue={department.name} required />
                </Field>
                <Field label="Description">
                  <input name="description" defaultValue={department.description} />
                </Field>
                <div className="panel-actions">
                  <button type="submit">Save department</button>
                </div>
              </form>
            ) : (
              <form
                className="settings-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.target);
                  await run(() =>
                    academicApi.createDepartment({
                      code: form.get('code'),
                      name: form.get('name'),
                      description: form.get('description'),
                    }),
                  );
                  await reload();
                }}
              >
                <p className="panel-lead">Create the department before batches, years, or memberships.</p>
                <Field label="Code">
                  <input name="code" required />
                </Field>
                <Field label="Name">
                  <input name="name" required />
                </Field>
                <Field label="Description">
                  <input name="description" />
                </Field>
                <div className="panel-actions">
                  <button type="submit">Create department</button>
                </div>
              </form>
            )}
          </Panel>
        </div>
      ) : null}

      {tab === 'Batches' ? (
        <ResourceList
          title="Batches"
          createTitle="Create batch"
          search={search}
          onSearch={setSearch}
          rows={batches}
          lookups={lookups}
          onPage={(page) => loadPage('batches', page)}
          columns={['code', 'name', 'status']}
          rowLink={(row) => `/admin/academic/batches/${row.id}`}
          onArchive={(row) => archive('batch', () => academicApi.updateBatch(row.id, { status: 'ARCHIVED' }))}
          onRestore={(row) => restore('batch', () => academicApi.updateBatch(row.id, { status: 'ACTIVE' }))}
          edit={{
            fields: [{ key: 'name', label: 'Name', required: true }],
            save: async (row, draft) => {
              await run(() => academicApi.updateBatch(row.id, { name: draft.name }));
              await reload();
            },
          }}
          form={
            <form
              className="settings-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.target);
                await run(() => academicApi.createBatch({ code: form.get('code'), name: form.get('name') }));
                event.target.reset();
                await reload();
              }}
            >
              <p className="panel-lead">A batch is a code and name. It does not belong to a year or semester.</p>
              <Field label="Code">
                <input name="code" required />
              </Field>
              <Field label="Name">
                <input name="name" required />
              </Field>
              <div className="panel-actions">
                <button type="submit">Create batch</button>
              </div>
            </form>
          }
        />
      ) : null}

      {tab === 'Years' ? (
        <ResourceList
          title="Academic years"
          createTitle="Create year"
          rows={years}
          lookups={lookups}
          onPage={(page) => loadPage('years', page)}
          columns={['sequence', 'name', 'status']}
          onArchive={(row) => archive('academic year', () => academicApi.updateYear(row.id, { status: 'ARCHIVED' }))}
          onRestore={(row) => restore('academic year', () => academicApi.updateYear(row.id, { status: 'ACTIVE' }))}
          onDelete={(row) => removeRecord('academic year', () => academicApi.deleteYear(row.id))}
          edit={{
            fields: [{ key: 'name', label: 'Name', required: true }],
            save: async (row, draft) => {
              await run(() => academicApi.updateYear(row.id, { name: draft.name }));
              await reload();
            },
          }}
          lead={
            <StructureStatus years={years.items} semesters={semesters.items} listsComplete={listsComplete} />
          }
          form={
            structureComplete ? (
              <p className="panel-lead">
                Creation is turned off because the eight active periods are already configured.
              </p>
            ) : (
            <form
              className="settings-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.target);
                await run(() =>
                  academicApi.createYear({ sequence: Number(form.get('sequence')), name: form.get('name') }),
                );
                event.target.reset();
                await reload();
              }}
            >
              <Field label="Sequence (1-4)">
                <input name="sequence" type="number" min="1" max="4" required />
              </Field>
              <Field label="Name">
                <input name="name" required />
              </Field>
              <div className="panel-actions">
                <button type="submit">Create year</button>
              </div>
            </form>
            )
          }
        />
      ) : null}

      {tab === 'Semesters' ? (
        <ResourceList
          title="Semesters"
          createTitle="Create semester"
          rows={semesters}
          lookups={lookups}
          onPage={(page) => loadPage('semesters', page)}
          columns={['academicYearId', 'sequence', 'name', 'status']}
          onArchive={(row) => archive('semester', () => academicApi.updateSemester(row.id, { status: 'ARCHIVED' }))}
          onRestore={(row) => restore('semester', () => academicApi.updateSemester(row.id, { status: 'ACTIVE' }))}
          onDelete={(row) => removeRecord('semester', () => academicApi.deleteSemester(row.id))}
          edit={{
            fields: [{ key: 'name', label: 'Name', required: true }],
            save: async (row, draft) => {
              await run(() => academicApi.updateSemester(row.id, { name: draft.name }));
              await reload();
            },
          }}
          lead={
            <StructureStatus years={years.items} semesters={semesters.items} listsComplete={listsComplete} />
          }
          form={
            structureComplete ? (
              <p className="panel-lead">
                Creation is turned off because the eight active periods are already configured.
              </p>
            ) : (
            <form
              className="settings-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.target);
                const created = await run(() =>
                  academicApi.createSemester({
                    academicYearId: form.get('academicYearId'),
                    sequence: Number(form.get('sequence')),
                    name: form.get('name'),
                  }),
                );
                if (!created?.data) {
                  return;
                }
                event.target.reset();
                setSemesters((current) => {
                  const items = current.items.some((item) => item.id === created.data.id)
                    ? current.items
                    : [...current.items, created.data];
                  return { ...current, items, total: Math.max(current.total + (items.length - current.items.length), items.length) };
                });
                await reload();
              }}
            >
              <Field label="Academic year">
                <select name="academicYearId" required>
                  {years.items.map((year) => (
                    <option key={year.id} value={year.id}>
                      {formatYearLabel(year)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sequence (1 or 2)">
                <input name="sequence" type="number" min="1" max="2" required />
              </Field>
              <Field label="Name">
                <input name="name" required />
              </Field>
              <div className="panel-actions">
                <button type="submit">Create semester</button>
              </div>
            </form>
            )
          }
        />
      ) : null}

      {tab === 'Subjects' ? (
        <ResourceList
          title="Subjects"
          createTitle="Create subject"
          search={search}
          onSearch={setSearch}
          rows={subjects}
          lookups={lookups}
          onPage={(page) => loadPage('subjects', page)}
          columns={['code', 'name', 'credits', 'status']}
          onArchive={(row) => archive('subject', () => academicApi.updateSubject(row.id, { status: 'ARCHIVED' }))}
          onRestore={(row) => restore('subject', () => academicApi.updateSubject(row.id, { status: 'ACTIVE' }))}
          edit={{
            fields: [
              { key: 'name', label: 'Name', required: true },
              { key: 'credits', label: 'Credits', type: 'number', required: true, min: 0, step: 0.5 },
            ],
            save: async (row, draft) => {
              await run(() =>
                academicApi.updateSubject(row.id, {
                  name: draft.name,
                  credits: Number(draft.credits),
                }),
              );
              await reload();
            },
          }}
          form={
            <form
              className="settings-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.target);
                await run(() =>
                  academicApi.createSubject({
                    code: form.get('code'),
                    name: form.get('name'),
                    credits: Number(form.get('credits')),
                  }),
                );
                event.target.reset();
                await reload();
              }}
            >
              <Field label="Code">
                <input name="code" required />
              </Field>
              <Field label="Name">
                <input name="name" required />
              </Field>
              <Field label="Credits">
                <input name="credits" type="number" min="0" step="0.5" required />
              </Field>
              <div className="panel-actions">
                <button type="submit">Create subject</button>
              </div>
            </form>
          }
        />
      ) : null}

      {tab === 'Curriculum' ? (
        <CurriculumPanel
          rows={curriculum}
          subjects={subjectCatalog}
          years={years.items}
          semesters={semesters.items}
          lookups={lookups}
          filters={listFilters.curriculum}
          onFilter={(filters) => loadPage('curriculum', 1, filters)}
          onPage={(page) => loadPage('curriculum', page)}
          onCreate={(body) => run(() => academicApi.createCurriculum(body))}
          onArchive={(row) =>
            archive('curriculum mapping', () => academicApi.updateCurriculum(row.id, { status: 'ARCHIVED' }))
          }
          onCreated={reload}
        />
      ) : null}

      {tab === 'Offerings' ? (
        <ResourceList
          title="Subject offerings"
          createTitle="Create offering"
          stacked
          rows={offerings}
          lookups={lookups}
          filters={
            <PeriodFilters
              years={years.items}
              value={listFilters.offerings}
              onChange={(filters) => loadPage('offerings', 1, filters)}
            />
          }
          onPage={(page) => loadPage('offerings', page)}
          columns={['subjectId', 'batchId', 'academicYearId', 'semesterId', 'status']}
          onArchive={(row) =>
            archive('subject offering', () => academicApi.updateOffering(row.id, { status: 'ARCHIVED' }))
          }
          onRestore={(row) =>
            restore('subject offering', () => academicApi.updateOffering(row.id, { status: 'ACTIVE' }))
          }
          form={
            <OfferingAssignForm
              batches={batches.items}
              years={years.items}
              semesters={semesters.items}
              subjects={subjectCatalog}
              lookups={lookups}
              onAssignPeriod={(body) => run(() => academicApi.assignPeriodOfferings(body))}
              onCreateOne={(body) => run(() => academicApi.createOffering(body))}
              onDone={reload}
            />
          }
        />
      ) : null}

      {tab === 'Lecturers' ? (
        <div className="admin-crud">
          <Panel title="Create lecturer account" kicker="Department staff">
            <form
              className="settings-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.target);
                await run(() =>
                  academicApi.createUser({
                    email: form.get('email'),
                    password: form.get('password'),
                    displayName: form.get('displayName'),
                    role: 'LECTURER',
                  }),
                );
                event.target.reset();
                await reload();
              }}
            >
              <Field label="Email">
                <input name="email" type="email" required />
              </Field>
              <Field label="Display name">
                <input name="displayName" required />
              </Field>
              <Field label="Temporary password">
                <input name="password" type="password" minLength={10} required />
              </Field>
              <div className="panel-actions">
                <button type="submit">Create lecturer account</button>
              </div>
            </form>
          </Panel>

          <Panel title="Lecturers" kicker={`${lecturers.total} total`}>
            {lecturers.items.length === 0 ? (
              <EmptyState>No lecturers in this department.</EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Account</th>
                      <th>Lecturer</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lecturers.items.map((row) => (
                      <tr key={row.id}>
                        <td>{row.email}</td>
                        <td>
                          <span className={statusPillClass(row.accountStatus)}>{row.accountStatus}</span>
                        </td>
                        <td>
                          <span className={statusPillClass(row.lecturerStatus)}>{row.lecturerStatus}</span>
                        </td>
                        <td>
                          {row.lecturerStatus !== 'VERIFIED' ? (
                            <button
                              type="button"
                              onClick={() =>
                                run(() => academicApi.setLecturerStatus(row.id, 'VERIFIED')).then(reload)
                              }
                            >
                              Verify
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                run(() => academicApi.setLecturerStatus(row.id, 'SUSPENDED')).then(reload)
                              }
                            >
                              Suspend lecturer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager
              page={lecturers.page}
              pageSize={lecturers.pageSize}
              total={lecturers.total}
              onPage={(page) => loadPage('lecturers', page)}
            />
          </Panel>
        </div>
      ) : null}

      {tab === 'Assignments' ? (
        <div className="admin-crud admin-crud--stacked">
          <Panel title="Assign lecturer" kicker="Active offerings">
            <form
              className="settings-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.target);
                await run(() =>
                  academicApi.assignLecturer({
                    lecturerUserId: form.get('lecturerUserId'),
                    subjectOfferingId: form.get('subjectOfferingId'),
                  }),
                );
                event.target.reset();
                await reload();
              }}
            >
              <Field label="Lecturer">
                <select name="lecturerUserId" required>
                  {lecturers.items
                    .filter((item) => item.lecturerStatus === 'VERIFIED')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.email}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Offering">
                <select name="subjectOfferingId" required>
                  {offerings.items
                    .filter((item) => item.status === 'ACTIVE')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatSubjectLabel({
                          code: item.subjectCode || lookups.subjects.get(String(item.subjectId))?.code,
                          name: item.subjectName || lookups.subjects.get(String(item.subjectId))?.name,
                        }) || item.id}
                        {' · '}
                        {formatBatchLabel(lookups.batches.get(String(item.batchId))) || 'Batch'}
                      </option>
                    ))}
                </select>
              </Field>
              <div className="panel-actions">
                <button type="submit">Assign lecturer</button>
              </div>
            </form>
          </Panel>

          <Panel
            title="Lecturer assignments"
            kicker={`${assignments.items.length} active`}
          >
            {assignments.items.length === 0 ? (
              <EmptyState>No active assignments.</EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Lecturer</th>
                      <th>Offering</th>
                      <th>Active</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.items.map((row) => {
                      const lecturer = lecturers.items.find((item) => item.id === row.lecturerUserId);
                      const offering = offerings.items.find((item) => item.id === row.subjectOfferingId);
                      const lecturerLabel =
                        row.lecturerDisplayName ||
                        lecturer?.displayName ||
                        row.lecturerEmail ||
                        lecturer?.email ||
                        'Lecturer';
                      const offeringLabel = formatOfferingLabel(
                        {
                          subjectCode: row.subjectCode || offering?.subjectCode,
                          subjectName: row.subjectName || offering?.subjectName,
                          subjectId: offering?.subjectId,
                          batchId: offering?.batchId,
                          batchCode: row.batchCode || offering?.batchCode,
                          batchName: row.batchName || offering?.batchName,
                          academicYearId: offering?.academicYearId,
                          semesterId: offering?.semesterId,
                        },
                        lookups,
                      );
                      return (
                      <tr key={row.id}>
                        <td>{lecturerLabel}</td>
                        <td>{offeringLabel || 'Offering'}</td>
                        <td>
                          <span className={statusPillClass(row.isActive)}>
                            {row.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          {row.isActive ? (
                            <button
                              type="button"
                              onClick={() => archive('assignment', () => academicApi.revokeAssignment(row.id))}
                            >
                              Revoke
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {tab === 'Students' ? (
        <div className="admin-crud admin-crud--stacked">
          <div className="admin-crud__forms">
            <Panel title="Create student account" kicker="Login identity">
              <form
                className="settings-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.target);
                  await run(() =>
                    academicApi.createUser({
                      email: form.get('email'),
                      password: form.get('password'),
                      displayName: form.get('displayName'),
                      role: 'STUDENT',
                    }),
                  );
                  event.target.reset();
                  await reload();
                }}
              >
                <Field label="Email">
                  <input name="email" type="email" required />
                </Field>
                <Field label="Display name">
                  <input name="displayName" required />
                </Field>
                <Field label="Temporary password">
                  <input name="password" type="password" minLength={10} required />
                </Field>
                <div className="panel-actions">
                  <button type="submit">Create student account</button>
                </div>
              </form>
            </Panel>

            <Panel title="Attach academic context" kicker="Registration number">
              <form
                className="settings-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.target);
                  await run(() =>
                    academicApi.createStudentContext({
                      userId: form.get('userId'),
                      registrationNumber: form.get('registrationNumber'),
                      batchId: form.get('batchId'),
                      currentAcademicYearId: form.get('currentAcademicYearId'),
                      currentSemesterId: form.get('currentSemesterId'),
                    }),
                  );
                  event.target.reset();
                  await reload();
                }}
              >
                <Field label="Student account">
                  <select name="userId" required>
                    {studentUsers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.email}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Registration number">
                  <input name="registrationNumber" required />
                </Field>
                <Field label="Batch">
                  <select name="batchId" required>
                    {batches.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.code}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Current year">
                  <select name="currentAcademicYearId" required>
                    {years.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatYearLabel(item) || item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Current semester">
                  <select name="currentSemesterId" required>
                    {semesters.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatSemesterLabel(item, lookups.years.get(String(item.academicYearId))) ||
                          item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="panel-actions">
                  <button type="submit">Attach academic context</button>
                </div>
              </form>
            </Panel>
          </div>

          <Panel title="Student academic records" kicker={`${students.total} total`}>
            {students.items.length === 0 ? (
              <EmptyState>No student academic records yet.</EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Registration number</th>
                      <th>Batch</th>
                      <th>Year</th>
                      <th>Semester</th>
                      <th>Specialization</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.items.map((row) => (
                      <tr key={row.id}>
                        <td>{row.registrationNumber}</td>
                        <td>{cellValue('batchId', row.batchId, lookups)}</td>
                        <td>{cellValue('currentAcademicYearId', row.currentAcademicYearId, lookups)}</td>
                        <td>{cellValue('currentSemesterId', row.currentSemesterId, lookups)}</td>
                        <td>
                          <select
                            aria-label={`Specialization for ${row.registrationNumber}`}
                            value={row.specialization || ''}
                            onChange={(event) =>
                              run(() =>
                                academicApi.updateStudentContext(row.id, {
                                  specialization: event.target.value || null,
                                }),
                              ).then(() => reload())
                            }
                          >
                            <option value="">Not set</option>
                            <option value="SWT">SWT</option>
                            <option value="NST">NST</option>
                          </select>
                        </td>
                        <td>
                          <span className={statusPillClass(row.status)}>{row.status}</span>
                        </td>
                        <td className="data-table__actions">
                          {row.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              onClick={() =>
                                archive('student context', () =>
                                  academicApi.updateStudentContext(row.id, { status: 'ARCHIVED' }),
                                )
                              }
                            >
                              Archive
                            </button>
                          ) : null}
                          {row.status === 'ARCHIVED' ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  restore('student context', () =>
                                    academicApi.updateStudentContext(row.id, { status: 'ACTIVE' }),
                                  )
                                }
                              >
                                Restore
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  removeRecord('student context', () => academicApi.deleteStudentContext(row.id))
                                }
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager
              page={students.page}
              pageSize={students.pageSize}
              total={students.total}
              onPage={(page) => loadPage('students', page)}
            />
          </Panel>
        </div>
      ) : null}
    </section>
  );
}

function PeriodFilters({ years, value = {}, onChange }) {
  const yearId = value.academicYearId || '';
  const semesterSequence = value.semesterSequence || '';
  const activeYears = [...years]
    .filter((year) => year.status === 'ACTIVE')
    .sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));

  return (
    <div className="period-filters">
      <div className="period-filters__group" role="group" aria-label="Filter by year">
        <span className="period-filters__label">Year</span>
        <button type="button" className={yearId ? undefined : 'is-active'} onClick={() => onChange({ academicYearId: '', semesterSequence })}>
          All
        </button>
        {activeYears.map((year) => (
          <button
            key={year.id}
            type="button"
            className={yearId === year.id ? 'is-active' : undefined}
            onClick={() => onChange({ academicYearId: year.id, semesterSequence })}
          >
            {formatYearLabel(year)}
          </button>
        ))}
      </div>
      <div className="period-filters__group" role="group" aria-label="Filter by semester">
        <span className="period-filters__label">Semester</span>
        <button
          type="button"
          className={semesterSequence ? undefined : 'is-active'}
          onClick={() => onChange({ academicYearId: yearId, semesterSequence: '' })}
        >
          All
        </button>
        {[1, 2].map((sequence) => (
          <button
            key={sequence}
            type="button"
            className={String(semesterSequence) === String(sequence) ? 'is-active' : undefined}
            onClick={() => onChange({ academicYearId: yearId, semesterSequence: String(sequence) })}
          >
            Semester {sequence}
          </button>
        ))}
      </div>
    </div>
  );
}

function assignPeriodMessage(data) {
  const skipped = data.skippedSubjects || [];
  const specializationSkips = skipped.filter((item) => item.reason === 'NO_STUDENT_WITH_SPECIALIZATION').length;
  const otherSkips = skipped.length - specializationSkips;
  if (!data.created && !data.alreadyExisted && skipped.length === 0) {
    return 'No curriculum subjects are mapped to this year and semester. Nothing was added.';
  }
  const parts = [
    data.created
      ? `Added ${data.created} subject${data.created === 1 ? '' : 's'}.`
      : 'No new subjects were added.',
  ];
  if (data.alreadyExisted) {
    parts.push(`${data.alreadyExisted} already offered for this batch.`);
  }
  if (specializationSkips) {
    parts.push(
      `${specializationSkips} left out because no student in this batch and period has that specialization.`,
    );
  }
  if (otherSkips) {
    parts.push(`${otherSkips} left out because the subject is not active.`);
  }
  return parts.join(' ');
}

function OfferingAssignForm({ batches, years, semesters, subjects, lookups, onAssignPeriod, onCreateOne, onDone }) {
  const [yearId, setYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [notice, setNotice] = useState('');
  const activeBatches = batches.filter((item) => item.status === 'ACTIVE');
  const activeYears = years.filter((item) => item.status === 'ACTIVE');
  const activeSubjects = subjects.filter((item) => item.status === 'ACTIVE');
  const semesterOptions = semesters.filter(
    (item) => item.status === 'ACTIVE' && yearId && item.academicYearId === yearId,
  );

  return (
    <form
      className="settings-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.target);
        const body = {
          batchId: form.get('batchId'),
          academicYearId: form.get('academicYearId'),
          semesterId: form.get('semesterId'),
        };
        const subjectId = String(form.get('subjectId') || '');
        setNotice('');
        if (subjectId) {
          const created = await onCreateOne({ ...body, subjectId });
          if (!created) {
            return;
          }
          setNotice('Added this subject for the batch.');
        } else {
          const assigned = await onAssignPeriod(body);
          if (!assigned?.data) {
            return;
          }
          setNotice(assignPeriodMessage(assigned.data));
        }
        event.target.reset();
        setYearId('');
        setSemesterId('');
        await onDone();
      }}
    >
      <p className="panel-lead">
        Choose a batch, year, and semester. Every curriculum subject for that period is offered to the batch. Choose a
        subject only when this batch needs one extra subject.
      </p>
      {notice ? (
        <p className="panel-lead" role="status">
          {notice}
        </p>
      ) : null}
      <Field label="Batch">
        <select name="batchId" required defaultValue={activeBatches[0]?.id || ''}>
          {activeBatches.map((item) => (
            <option key={item.id} value={item.id}>
              {formatBatchLabel(item)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Academic year">
        <select
          name="academicYearId"
          required
          value={yearId}
          onChange={(event) => {
            setYearId(event.target.value);
            setSemesterId('');
          }}
        >
          <option value="" disabled>
            Select year
          </option>
          {activeYears.map((item) => (
            <option key={item.id} value={item.id}>
              {formatYearLabel(item)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Semester">
        <select
          name="semesterId"
          required
          value={semesterId}
          onChange={(event) => setSemesterId(event.target.value)}
        >
          <option value="" disabled>
            Select semester
          </option>
          {semesterOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {formatSemesterLabel(item, lookups.years.get(String(item.academicYearId)))}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Subject, optional">
        <select name="subjectId" defaultValue="">
          <option value="">Semester subjects only</option>
          {activeSubjects.map((item) => (
            <option key={item.id} value={item.id}>
              {formatSubjectLabel(item)}
            </option>
          ))}
        </select>
      </Field>
      <div className="panel-actions">
        <button type="submit">Assign subjects</button>
      </div>
    </form>
  );
}

function CurriculumPanel({ rows, subjects, years, semesters, lookups, filters, onFilter, onPage, onCreate, onArchive, onCreated }) {
  const [yearId, setYearId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [specialization, setSpecialization] = useState('');
  const activeYears = years.filter((year) => year.status === 'ACTIVE');
  const activeSubjects = subjects.filter((subject) => subject.status === 'ACTIVE');
  const selectedYear = activeYears.find((year) => year.id === yearId);
  const needsSpecialization = Number(selectedYear?.sequence) >= 3;
  const semesterOptions = semesters.filter(
    (semester) => semester.status === 'ACTIVE' && (!yearId || semester.academicYearId === yearId),
  );

  return (
    <ResourceList
      title="Curriculum"
      createTitle="Map a subject"
      stacked
      rows={rows}
      lookups={lookups}
      filters={<PeriodFilters years={years} value={filters} onChange={onFilter} />}
      onPage={onPage}
      columns={['subjectId', 'academicYearId', 'semesterId', 'specialization', 'status']}
      onArchive={onArchive}
      form={
        <form
          className="settings-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.target);
            const created = await onCreate({
              subjectId: form.get('subjectId'),
              academicYearId: form.get('academicYearId'),
              semesterId: form.get('semesterId'),
              specialization: needsSpecialization ? form.get('specialization') : null,
            });
            if (!created) {
              return;
            }
            event.target.reset();
            setYearId('');
            setSemesterId('');
            setSpecialization('');
            await onCreated();
          }}
        >
          <p className="panel-lead">
            Choose a subject that already exists, then the year and semester it belongs to. Years 1 and 2 stay common.
            Years 3 and 4 need SWT or NST. This does not create a new subject, and it does not create a batch offering.
          </p>
          <Field label="Subject">
            <select name="subjectId" required defaultValue="">
              <option value="" disabled>
                Select subject
              </option>
              {activeSubjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatSubjectLabel(item)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Academic year">
            <select
              name="academicYearId"
              required
              value={yearId}
              onChange={(event) => {
                setYearId(event.target.value);
                setSemesterId('');
                setSpecialization('');
              }}
            >
              <option value="" disabled>
                Select year
              </option>
              {activeYears.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatYearLabel(item)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Semester">
            <select
              name="semesterId"
              required
              value={semesterId}
              onChange={(event) => setSemesterId(event.target.value)}
            >
              <option value="" disabled>
                Select semester
              </option>
              {semesterOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatSemesterLabel(item, lookups.years.get(String(item.academicYearId)))}
                </option>
              ))}
            </select>
          </Field>
          {needsSpecialization ? (
            <Field label="Specialization">
              <select
                name="specialization"
                required
                value={specialization}
                onChange={(event) => setSpecialization(event.target.value)}
              >
                <option value="" disabled>
                  Select SWT or NST
                </option>
                <option value="SWT">SWT</option>
                <option value="NST">NST</option>
              </select>
            </Field>
          ) : null}
          <div className="panel-actions">
            <button type="submit">Save mapping</button>
          </div>
        </form>
      }
    />
  );
}

function ResourceList({
  title,
  createTitle,
  rows,
  columns,
  form,
  onArchive,
  onRestore,
  onDelete,
  edit,
  search,
  onSearch,
  filters = null,
  stacked = false,
  lookups = {},
  onPage,
  rowLink,
  lead,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const editFields = edit?.fields || [];
  const editFieldKeys = new Set(editFields.map((field) => field.key));

  function beginEdit(row) {
    const nextDraft = {};
    for (const field of editFields) {
      nextDraft[field.key] = row[field.key] ?? '';
    }
    setEditingId(row.id);
    setDraft(nextDraft);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  async function submitEdit(row) {
    if (!edit?.save) {
      return;
    }
    for (const field of editFields) {
      if (field.required && !String(draft[field.key] ?? '').trim()) {
        return;
      }
    }
    setSavingEdit(true);
    try {
      await edit.save(row, draft);
      cancelEdit();
    } finally {
      setSavingEdit(false);
    }
  }

  const list = (
    <div className={stacked ? 'admin-crud admin-crud--stacked' : 'admin-crud'}>
      <Panel title={createTitle || `Create ${title.toLowerCase()}`} kicker="New record">
        {form}
      </Panel>

      <Panel title={title} kicker={`${rows.total} total`}>
        {filters}
        {onSearch ? (
          <div className="filter-bar filter-bar--search">
            <label>
              Search
              <input
                value={search}
                onChange={(event) => onSearch(event.target.value)}
                maxLength={64}
                autoComplete="off"
                placeholder="Filter by code or name"
              />
            </label>
          </div>
        ) : null}

        {rows.items.length === 0 ? (
          <EmptyState>No records.</EmptyState>
        ) : (
          <div className="table-scroll admin-structure__table">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>{COLUMN_LABELS[column] || column}</th>
                  ))}
                  <th className="data-table__actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.items.map((row) => {
                  const isEditing = editingId === row.id;
                  return (
                  <tr key={row.id}>
                    {columns.map((column) => (
                      <td
                        key={column}
                        className={column === 'status' ? 'data-table__status' : undefined}
                      >
                        {isEditing && editFieldKeys.has(column) ? (
                          <input
                            type={editFields.find((field) => field.key === column)?.type || 'text'}
                            min={editFields.find((field) => field.key === column)?.min}
                            step={editFields.find((field) => field.key === column)?.step}
                            value={draft[column] ?? ''}
                            onChange={(event) =>
                              setDraft((current) => ({ ...current, [column]: event.target.value }))
                            }
                            aria-label={editFields.find((field) => field.key === column)?.label || column}
                          />
                        ) : (
                          cellValue(column, row[column], lookups, row)
                        )}
                      </td>
                    ))}
                    <td className="data-table__actions">
                      {rowLink && !isEditing ? <Link to={rowLink(row)}>View</Link> : null}
                      {isEditing ? (
                        <>
                          <button type="button" disabled={savingEdit} onClick={() => submitEdit(row)}>
                            {savingEdit ? 'Saving…' : 'Save'}
                          </button>
                          <button type="button" disabled={savingEdit} onClick={cancelEdit}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {edit ? (
                            <button type="button" onClick={() => beginEdit(row)}>
                              Edit
                            </button>
                          ) : null}
                          {row.status === 'ACTIVE' && onArchive ? (
                            <button type="button" onClick={() => onArchive(row)}>
                              Archive
                            </button>
                          ) : null}
                          {row.status === 'ARCHIVED' && onRestore ? (
                            <button type="button" onClick={() => onRestore(row)}>
                              Restore
                            </button>
                          ) : null}
                          {row.status === 'ARCHIVED' && onDelete ? (
                            <button type="button" onClick={() => onDelete(row)}>
                              Delete
                            </button>
                          ) : null}
                        </>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pager
          page={rows.page}
          pageSize={rows.pageSize}
          total={rows.total}
          onPage={onPage || (() => undefined)}
        />
      </Panel>
    </div>
  );

  if (!lead) {
    return list;
  }

  return (
    <div className="admin-structure">
      <Panel title="Shared academic structure" kicker="Department setup">
        {lead}
      </Panel>
      {list}
    </div>
  );
}
