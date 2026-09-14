import { useCallback, useEffect, useState } from 'react';
import { academicApi } from './academic-api.js';

const TABS = [
  'Overview',
  'Department',
  'Batches',
  'Years',
  'Semesters',
  'Subjects',
  'Offerings',
  'Lecturers',
  'Assignments',
  'Students',
];

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
  return <p className="form-error">{error}</p>;
}

function Pager({ page, pageSize, total, onPage }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <p>
      Page {page} of {last} ({total} records){' '}
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>{' '}
      <button type="button" disabled={page >= last} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </p>
  );
}

function confirmArchive(label) {
  return window.confirm(`Archive this ${label}? Existing history is kept. This does not delete records.`);
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
  const [offerings, setOfferings] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [lecturers, setLecturers] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [assignments, setAssignments] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [students, setStudents] = useState({ items: [], total: 0, page: 1, pageSize: 20 });
  const [studentUsers, setStudentUsers] = useState([]);
  const [search, setSearch] = useState('');

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
        academicApi.overview().catch((error) => {
          if (error.status === 400) {
            return { data: { department: null, counts: {} } };
          }
          throw error;
        }),
        academicApi.departments(),
      ]);
      const dept = departmentsRes.data.items[0] || null;
      const [batchRes, yearRes, semesterRes, subjectRes, offeringRes, lecturerRes, assignmentRes, studentRes, studentUserRes] =
        dept
          ? await Promise.all([
              academicApi.batches({ q: search, status: 'ALL', pageSize: 50 }),
              academicApi.years({ status: 'ALL', pageSize: 50 }),
              academicApi.semesters({ status: 'ALL', pageSize: 50 }),
              academicApi.subjects({ q: search, status: 'ALL', pageSize: 50 }),
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
        offeringRes,
        lecturerRes,
        assignmentRes,
        studentRes,
        studentUserRes,
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
        setOfferings(result.offeringRes.data);
        setLecturers(result.lecturerRes.data);
        setAssignments(result.assignmentRes.data);
        setStudents(result.studentRes.data);
        setStudentUsers(result.studentUserRes.data.items);
      }
    }
    setLoading(false);
  }, [run, search]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function archive(label, fn) {
    if (!confirmArchive(label)) {
      return;
    }
    await run(fn);
    await reload();
  }

  return (
    <section className="admin-page">
      <h1>Academic administration</h1>
      <p>Manage department structure, offerings, lecturers, and student academic membership.</p>
      <nav className="tab-nav">
        {TABS.map((item) => (
          <button key={item} type="button" className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>
      <ErrorBanner error={error} />
      {loading ? <p>Loading academic data…</p> : null}

      {tab === 'Overview' ? (
        <div>
          {!department ? <p>No department is configured yet. Create one in the Department tab.</p> : null}
          {overview?.counts ? (
            <ul>
              {Object.entries(overview.counts).map(([key, value]) => (
                <li key={key}>
                  {key}: {value}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {tab === 'Department' ? (
        <div>
          {department ? (
            <form
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
              <p>Code: {department.code} (immutable)</p>
              <p>Status: {department.status}</p>
              <Field label="Name">
                <input name="name" defaultValue={department.name} required />
              </Field>
              <Field label="Description">
                <input name="description" defaultValue={department.description} />
              </Field>
              <button type="submit">Save department</button>
            </form>
          ) : (
            <form
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
              <Field label="Code">
                <input name="code" required />
              </Field>
              <Field label="Name">
                <input name="name" required />
              </Field>
              <Field label="Description">
                <input name="description" />
              </Field>
              <button type="submit">Create department</button>
            </form>
          )}
        </div>
      ) : null}

      {tab === 'Batches' ? (
        <ResourceList
          title="Batches"
          search={search}
          onSearch={setSearch}
          rows={batches}
          columns={['code', 'name', 'status']}
          onArchive={(row) => archive('batch', () => academicApi.updateBatch(row.id, { status: 'ARCHIVED' }))}
          form={
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.target);
                await run(() => academicApi.createBatch({ code: form.get('code'), name: form.get('name') }));
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
              <button type="submit">Create batch</button>
            </form>
          }
        />
      ) : null}

      {tab === 'Years' ? (
        <ResourceList
          title="Academic years"
          rows={years}
          columns={['sequence', 'name', 'status']}
          onArchive={(row) => archive('academic year', () => academicApi.updateYear(row.id, { status: 'ARCHIVED' }))}
          form={
            <form
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
              <button type="submit">Create year</button>
            </form>
          }
        />
      ) : null}

      {tab === 'Semesters' ? (
        <ResourceList
          title="Semesters"
          rows={semesters}
          columns={['academicYearId', 'sequence', 'name', 'status']}
          onArchive={(row) => archive('semester', () => academicApi.updateSemester(row.id, { status: 'ARCHIVED' }))}
          form={
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.target);
                await run(() =>
                  academicApi.createSemester({
                    academicYearId: form.get('academicYearId'),
                    sequence: Number(form.get('sequence')),
                    name: form.get('name'),
                  }),
                );
                event.target.reset();
                await reload();
              }}
            >
              <Field label="Academic year">
                <select name="academicYearId" required>
                  {years.items.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
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
              <button type="submit">Create semester</button>
            </form>
          }
        />
      ) : null}

      {tab === 'Subjects' ? (
        <ResourceList
          title="Subjects"
          search={search}
          onSearch={setSearch}
          rows={subjects}
          columns={['code', 'name', 'credits', 'status']}
          onArchive={(row) => archive('subject', () => academicApi.updateSubject(row.id, { status: 'ARCHIVED' }))}
          form={
            <form
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
              <button type="submit">Create subject</button>
            </form>
          }
        />
      ) : null}

      {tab === 'Offerings' ? (
        <ResourceList
          title="Subject offerings"
          rows={offerings}
          columns={['subjectId', 'batchId', 'academicYearId', 'semesterId', 'status']}
          onArchive={(row) =>
            archive('subject offering', () => academicApi.updateOffering(row.id, { status: 'ARCHIVED' }))
          }
          form={
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.target);
                await run(() =>
                  academicApi.createOffering({
                    subjectId: form.get('subjectId'),
                    batchId: form.get('batchId'),
                    academicYearId: form.get('academicYearId'),
                    semesterId: form.get('semesterId'),
                  }),
                );
                event.target.reset();
                await reload();
              }}
            >
              <Field label="Subject">
                <select name="subjectId" required>
                  {subjects.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} — {item.name}
                    </option>
                  ))}
                </select>
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
              <Field label="Academic year">
                <select name="academicYearId" required>
                  {years.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Semester">
                <select name="semesterId" required>
                  {semesters.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="submit">Create offering</button>
            </form>
          }
        />
      ) : null}

      {tab === 'Lecturers' ? (
        <div>
          <h2>Lecturers</h2>
          <form
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
            <button type="submit">Create lecturer account</button>
          </form>
          {lecturers.items.length === 0 ? <p>No lecturers in this department.</p> : null}
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Lecturer status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lecturers.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.email}</td>
                  <td>{row.accountStatus}</td>
                  <td>{row.lecturerStatus}</td>
                  <td>
                    {row.lecturerStatus !== 'VERIFIED' ? (
                      <button type="button" onClick={() => run(() => academicApi.setLecturerStatus(row.id, 'VERIFIED')).then(reload)}>
                        Verify
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => run(() => academicApi.setLecturerStatus(row.id, 'SUSPENDED')).then(reload)}
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
      ) : null}

      {tab === 'Assignments' ? (
        <div>
          <h2>Lecturer assignments</h2>
          <form
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
                      {item.subjectCode || item.subjectId} / {item.batchId}
                    </option>
                  ))}
              </select>
            </Field>
            <button type="submit">Assign lecturer</button>
          </form>
          {assignments.items.length === 0 ? <p>No active assignments.</p> : null}
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
              {assignments.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.lecturerUserId}</td>
                  <td>{row.subjectOfferingId}</td>
                  <td>{String(row.isActive)}</td>
                  <td>
                    {row.isActive ? (
                      <button type="button" onClick={() => archive('assignment', () => academicApi.revokeAssignment(row.id))}>
                        Revoke
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === 'Students' ? (
        <div>
          <h2>Student academic context</h2>
          <form
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
            <button type="submit">Create student account</button>
          </form>
          <form
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
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Current semester">
              <select name="currentSemesterId" required>
                {semesters.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit">Attach academic context</button>
          </form>
          {students.items.length === 0 ? <p>No student academic records yet.</p> : null}
          <table className="data-table">
            <thead>
              <tr>
                <th>Registration number</th>
                <th>Batch</th>
                <th>Year</th>
                <th>Semester</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {students.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.registrationNumber}</td>
                  <td>{row.batchId}</td>
                  <td>{row.currentAcademicYearId}</td>
                  <td>{row.currentSemesterId}</td>
                  <td>{row.status}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => archive('student context', () => academicApi.updateStudentContext(row.id, { status: 'ARCHIVED' }))}
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ResourceList({ title, rows, columns, form, onArchive, search, onSearch }) {
  return (
    <div>
      <h2>{title}</h2>
      {onSearch ? (
        <Field label="Search">
          <input value={search} onChange={(event) => onSearch(event.target.value)} />
        </Field>
      ) : null}
      {form}
      {rows.items.length === 0 ? <p>No records.</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.items.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column}>{String(row[column] ?? '')}</td>
              ))}
              <td>
                {row.status === 'ACTIVE' && onArchive ? (
                  <button type="button" onClick={() => onArchive(row)}>
                    Archive
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager
        page={rows.page}
        pageSize={rows.pageSize}
        total={rows.total}
        onPage={() => undefined}
      />
    </div>
  );
}
