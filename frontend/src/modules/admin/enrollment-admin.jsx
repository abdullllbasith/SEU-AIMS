import { useEffect, useMemo, useState } from 'react';
import { academicApi } from './academic-api.js';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { formatSemesterLabel, formatYearLabel, indexById } from '../../ui/academic-labels.js';

function periodLabel(yearId, semesterId, yearsById, semestersById) {
  if (!yearId && !semesterId) {
    return '';
  }
  const year = yearsById.get(String(yearId));
  const semester = semestersById.get(String(semesterId));
  return formatSemesterLabel(semester, year) || formatYearLabel(year) || '';
}

function when(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString();
}

function subjectLabel(enrollment, offeringsById, subjectsById) {
  const offering = offeringsById.get(String(enrollment.subjectOfferingId));
  const subject = subjectsById.get(String(enrollment.subjectId));
  const code = enrollment.subjectCode || offering?.subjectCode || subject?.code || 'Subject';
  const name = offering?.subjectName || subject?.name || '';
  return { code, name };
}

export function EnrollmentTable({ enrollments, offeringsById, subjectsById, yearsById, semestersById, onCancel, cancellingId }) {
  if (!enrollments.length) {
    return <EmptyState>No repeat or arrear enrollments.</EmptyState>;
  }
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Type</th>
            <th>Offering period</th>
            <th>Status</th>
            <th>Original period</th>
            <th>Created</th>
            <th>Cancelled</th>
            {onCancel ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {enrollments.map((row) => {
            const subject = subjectLabel(row, offeringsById, subjectsById);
            const offering = offeringsById.get(String(row.subjectOfferingId));
            const offeringPeriod = offering
              ? periodLabel(offering.academicYearId, offering.semesterId, yearsById, semestersById)
              : '';
            const originalPeriod = periodLabel(
              row.originalAcademicYearId,
              row.originalSemesterId,
              yearsById,
              semestersById,
            );
            return (
              <tr key={row.id}>
                <td>
                  <span className="result-subject">{subject.code}</span>
                  {subject.name ? <span className="stack-item__meta"> {subject.name}</span> : null}
                </td>
                <td>{row.enrollmentType}</td>
                <td>{offeringPeriod || row.subjectOfferingId}</td>
                <td>
                  <span className="status-pill">{row.status}</span>
                </td>
                <td>{originalPeriod || '—'}</td>
                <td>{when(row.createdAt) || '—'}</td>
                <td>{row.status === 'CANCELLED' ? when(row.cancelledAt) || 'Cancelled' : '—'}</td>
                {onCancel ? (
                  <td>
                    {row.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        disabled={cancellingId === row.id}
                        onClick={() => onCancel(row)}
                      >
                        {cancellingId === row.id ? 'Cancelling…' : 'Cancel'}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StudentEnrollmentsPanel({ userId, registrationNumber }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contextId, setContextId] = useState('');
  const [enrollments, setEnrollments] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [years, setYears] = useState([]);
  const [semesters, setSemesters] = useState([]);

  useEffect(() => {
    let cancelled = false;
    if (!registrationNumber) {
      setLoading(false);
      setContextId('');
      setEnrollments([]);
      setError('');
      return undefined;
    }
    setLoading(true);
    setError('');
    Promise.all([
      academicApi.students({ q: registrationNumber, status: 'ALL', pageSize: 50 }),
      academicApi.offerings({ status: 'ALL', pageSize: 50 }),
      academicApi.subjects({ status: 'ALL', pageSize: 50 }),
      academicApi.years({ status: 'ALL', pageSize: 50 }),
      academicApi.semesters({ status: 'ALL', pageSize: 50 }),
    ])
      .then(async ([studentRes, offeringRes, subjectRes, yearRes, semesterRes]) => {
        if (cancelled) {
          return;
        }
        const match = (studentRes.data.items || []).find(
          (item) =>
            String(item.userId) === String(userId) &&
            String(item.registrationNumber).toUpperCase() === String(registrationNumber).toUpperCase(),
        );
        setOfferings(offeringRes.data.items || []);
        setSubjects(subjectRes.data.items || []);
        setYears(yearRes.data.items || []);
        setSemesters(semesterRes.data.items || []);
        if (!match) {
          setContextId('');
          setEnrollments([]);
          return;
        }
        setContextId(match.id);
        const enrollmentRes = await academicApi.studentEnrollments(match.id, { status: 'ALL', pageSize: 50 });
        if (!cancelled) {
          setEnrollments(enrollmentRes.data.items || []);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load enrollments');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, registrationNumber]);

  const offeringsById = useMemo(() => indexById(offerings), [offerings]);
  const subjectsById = useMemo(() => indexById(subjects), [subjects]);
  const yearsById = useMemo(() => indexById(years), [years]);
  const semestersById = useMemo(() => indexById(semesters), [semesters]);

  return (
    <Panel title="Repeat and arrear enrollments" kicker={registrationNumber || 'No registration number'}>
      {loading ? <p>Loading enrollments…</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && !registrationNumber ? (
        <EmptyState>This student has no registration number, so enrollments cannot be listed.</EmptyState>
      ) : null}
      {!loading && !error && registrationNumber && !contextId ? (
        <EmptyState>No academic membership was found for this registration number.</EmptyState>
      ) : null}
      {!loading && !error && contextId ? (
        <EnrollmentTable
          enrollments={enrollments}
          offeringsById={offeringsById}
          subjectsById={subjectsById}
          yearsById={yearsById}
          semestersById={semestersById}
        />
      ) : null}
    </Panel>
  );
}

export function OfferingEnrollmentRoster({ batchId, years, semesters }) {
  const [offerings, setOfferings] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [offeringsError, setOfferingsError] = useState('');
  const [offeringsLoading, setOfferingsLoading] = useState(true);
  const [offeringId, setOfferingId] = useState('');
  const [enrollments, setEnrollments] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [matches, setMatches] = useState([]);
  const [searched, setSearched] = useState(false);
  const [studentContextId, setStudentContextId] = useState('');
  const [enrollmentType, setEnrollmentType] = useState('REPEAT');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancellingId, setCancellingId] = useState('');

  const yearsById = useMemo(() => indexById(years), [years]);
  const semestersById = useMemo(() => indexById(semesters), [semesters]);
  const offeringsById = useMemo(() => indexById(offerings), [offerings]);
  const subjectsById = useMemo(() => indexById(subjects), [subjects]);
  const selectedOffering = offeringsById.get(String(offeringId));

  function loadEnrollments(nextOfferingId) {
    if (!nextOfferingId) {
      setEnrollments([]);
      return Promise.resolve();
    }
    setListLoading(true);
    setListError('');
    return academicApi
      .offeringEnrollments(nextOfferingId, { status: 'ALL', pageSize: 50 })
      .then((response) => setEnrollments(response.data.items || []))
      .catch((caught) => {
        setEnrollments([]);
        setListError(caught.message || 'Unable to load enrollments');
      })
      .finally(() => setListLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    setOfferingsLoading(true);
    setOfferingsError('');
    Promise.all([
      academicApi.offerings({ batchId, status: 'ALL', pageSize: 50 }),
      academicApi.subjects({ status: 'ALL', pageSize: 50 }),
    ])
      .then(([offeringRes, subjectRes]) => {
        if (cancelled) {
          return;
        }
        setOfferings(offeringRes.data.items || []);
        setSubjects(subjectRes.data.items || []);
      })
      .catch((caught) => {
        if (!cancelled) {
          setOfferingsError(caught.message || 'Unable to load offerings');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOfferingsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  function offeringOptionLabel(offering) {
    const code = offering.subjectCode || subjectsById.get(String(offering.subjectId))?.code || 'Subject';
    const name = offering.subjectName || subjectsById.get(String(offering.subjectId))?.name || '';
    const period = periodLabel(offering.academicYearId, offering.semesterId, yearsById, semestersById);
    return [code, name, period].filter(Boolean).join(' — ');
  }

  return (
    <Panel title="Repeat and arrear enrollments" kicker="Existing offerings">
      <p className="panel-lead">
        Enroll a student who already belongs to this batch into an existing offering. This does not create an offering,
        change the student&apos;s current period, or write an official result.
      </p>
      {offeringsLoading ? <p>Loading offerings…</p> : null}
      {offeringsError ? (
        <p className="form-error" role="alert">
          {offeringsError}
        </p>
      ) : null}
      {!offeringsLoading && !offeringsError && offerings.length === 0 ? (
        <EmptyState>No offerings exist for this batch yet. Create or generate an offering before enrolling a student.</EmptyState>
      ) : null}
      {offerings.length ? (
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            const query = registrationNumber.trim();
            if (!selectedOffering || !query) {
              return;
            }
            setBusy(true);
            setFormError('');
            setSearched(false);
            academicApi
              .students({ q: query, batchId, status: 'ALL', pageSize: 20 })
              .then((response) => {
                const items = (response.data.items || []).filter((item) =>
                  String(item.registrationNumber).toUpperCase().startsWith(query.toUpperCase()),
                );
                setMatches(items);
                setSearched(true);
                setStudentContextId(items.length === 1 ? items[0].id : '');
              })
              .catch((caught) => setFormError(caught.message || 'Unable to search students'))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Offering
            <select
              name="subjectOfferingId"
              value={offeringId}
              onChange={(event) => {
                const next = event.target.value;
                setOfferingId(next);
                setFormError('');
                setEnrollments([]);
                loadEnrollments(next);
              }}
            >
              <option value="">Select an existing offering</option>
              {offerings.map((offering) => (
                <option key={offering.id} value={offering.id}>
                  {offeringOptionLabel(offering)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Registration number
            <input
              name="registrationNumber"
              value={registrationNumber}
              onChange={(event) => setRegistrationNumber(event.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="panel-actions">
            <button type="submit" disabled={busy || !offeringId || !registrationNumber.trim()}>
              {busy ? 'Searching…' : 'Find student'}
            </button>
          </div>
        </form>
      ) : null}
      {searched && matches.length === 0 ? (
        <EmptyState>No student in this batch matches that registration number.</EmptyState>
      ) : null}
      {matches.length ? (
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!offeringId || !studentContextId || !enrollmentType) {
              return;
            }
            setBusy(true);
            setFormError('');
            academicApi
              .createOfferingEnrollment(offeringId, {
                studentContextId,
                enrollmentType,
              })
              .then(() => {
                setFormError('');
                return loadEnrollments(offeringId);
              })
              .catch((caught) => {
                setFormError(caught.message || 'Unable to create enrollment');
              })
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Student
            <select
              name="studentContextId"
              value={studentContextId}
              onChange={(event) => setStudentContextId(event.target.value)}
              required
            >
              <option value="">Select student</option>
              {matches.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.registrationNumber}
                </option>
              ))}
            </select>
          </label>
          <label>
            Enrollment type
            <select
              name="enrollmentType"
              value={enrollmentType}
              onChange={(event) => setEnrollmentType(event.target.value)}
            >
              <option value="REPEAT">REPEAT</option>
              <option value="ARREAR">ARREAR</option>
            </select>
          </label>
          <div className="panel-actions">
            <button type="submit" disabled={busy || !studentContextId}>
              {busy ? 'Enrolling…' : 'Enroll student'}
            </button>
          </div>
        </form>
      ) : null}
      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      {offeringId ? (
        <>
          {listLoading ? <p>Loading enrollments…</p> : null}
          {listError ? (
            <p className="form-error" role="alert">
              {listError}
            </p>
          ) : null}
          {!listLoading && !listError ? (
            <EnrollmentTable
              enrollments={enrollments}
              offeringsById={offeringsById}
              subjectsById={subjectsById}
              yearsById={yearsById}
              semestersById={semestersById}
              cancellingId={cancellingId}
              onCancel={(row) => {
                const subject = subjectLabel(row, offeringsById, subjectsById);
                const confirmed = window.confirm(
                  `Cancel the ${row.enrollmentType} enrollment for ${row.registrationNumber} in ${subject.code}? The enrollment record is kept.`,
                );
                if (!confirmed) {
                  return;
                }
                setCancellingId(row.id);
                setFormError('');
                academicApi
                  .cancelEnrollment(row.id)
                  .then(() => loadEnrollments(offeringId))
                  .catch((caught) => setFormError(caught.message || 'Unable to cancel enrollment'))
                  .finally(() => setCancellingId(''));
              }}
            />
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
