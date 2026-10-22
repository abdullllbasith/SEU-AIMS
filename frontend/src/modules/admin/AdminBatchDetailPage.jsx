import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { academicApi } from './academic-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import { formatSemesterLabel, formatYearLabel } from '../../ui/academic-labels.js';
import { OfferingEnrollmentRoster } from './enrollment-admin.jsx';

export function AdminBatchDetailPage() {
  const { batchId } = useParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState(null);
  const [years, setYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [pending, setPending] = useState('');
  const busy = Boolean(pending);
  const [preview, setPreview] = useState(null);
  const [generation, setGeneration] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [progression, setProgression] = useState(null);
  const [progressing, setProgressing] = useState(false);
  const [progressResult, setProgressResult] = useState(null);

  function load() {
    setLoading(true);
    return Promise.all([
      academicApi.batch(batchId),
      academicApi.years({ status: 'ALL', pageSize: 50 }),
      academicApi.semesters({ status: 'ALL', pageSize: 50 }),
    ])
      .then(([batchRes, yearRes, semesterRes]) => {
        setBatch(batchRes.data);
        setYears(yearRes.data.items || []);
        setSemesters(semesterRes.data.items || []);
        setError('');
        if (batchRes.data?.academicContextVerifiedAt && batchRes.data.status === 'ACTIVE') {
          return Promise.all([
            academicApi.offeringPreview(batchId).then((previewRes) => setPreview(previewRes.data)),
            academicApi.progressionPreview(batchId).then((progressRes) => setProgression(progressRes.data)),
          ]).catch((caught) => {
            setPreview(null);
            setProgression(null);
            setError(caught.message || 'Unable to load batch actions');
          });
        }
        setPreview(null);
        setProgression(null);
        return null;
      })
      .catch((caught) => setError(caught.message || 'Unable to load batch'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [batchId]);

  if (loading && !batch) {
    return <PageSkeleton title="Batch" variant="list" rows={4} />;
  }

  const verified = Boolean(batch?.academicContextVerifiedAt);
  const yearLabel = batch?.currentAcademicYearName || 'Not verified';
  const semesterLabel = batch?.currentSemesterName
    ? `${batch.currentAcademicYearName ? `${batch.currentAcademicYearName} · ` : ''}${batch.currentSemesterName}`
    : 'Not verified';

  return (
    <section className="admin-page record-page">
      <PageHeader
        title={batch ? `${batch.code} — ${batch.name}` : 'Batch'}
        purpose="Batch identity and its verified current academic period. Student registration numbers are not changed here."
      />
      <p>
        <Link to="/admin/academic">Back to academic admin</Link>
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {batch ? (
        <>
          <div className="stat-grid">
            <StatCard label="Code" value={batch.code} />
            <StatCard label="Status" value={batch.status} />
            <StatCard label="Current year" value={yearLabel} />
            <StatCard label="Current semester" value={semesterLabel} />
            <StatCard label="Students" value={String(batch.studentCount ?? 0)} />
            <StatCard label="Specialization" value={batch.specialization || 'Not set'} />
          </div>
          <Panel title="Current academic context" kicker={verified ? 'Verified' : 'Needs verification'}>
            {verified ? (
              <p>
                This batch is verified at {yearLabel}, {batch.currentSemesterName}. Changing the period is reserved
                for batch progression and is not available on this screen.
              </p>
            ) : (
              <form
                className="settings-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.target);
                  setPending('context');
                  academicApi
                    .assignBatchContext(batch.id, {
                      currentAcademicYearId: form.get('currentAcademicYearId'),
                      currentSemesterId: form.get('currentSemesterId'),
                    })
                    .then(() => load())
                    .catch((caught) => setError(caught.message || 'Unable to assign academic context'))
                    .finally(() => setPending(''));
                }}
              >
                <p className="panel-lead">
                  Choose the period this batch is in now. This does not move students or rewrite their history.
                </p>
                <label>
                  Academic year
                  <select name="currentAcademicYearId" required defaultValue="">
                    <option value="" disabled>
                      Select year
                    </option>
                    {years
                      .filter((year) => year.status === 'ACTIVE')
                      .map((year) => (
                        <option key={year.id} value={year.id}>
                          {formatYearLabel(year)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Semester
                  <select name="currentSemesterId" required defaultValue="">
                    <option value="" disabled>
                      Select semester
                    </option>
                    {semesters
                      .filter((semester) => semester.status === 'ACTIVE')
                      .map((semester) => {
                        const year = years.find((item) => item.id === semester.academicYearId);
                        return (
                          <option key={semester.id} value={semester.id}>
                            {formatSemesterLabel(semester, year)}
                          </option>
                        );
                      })}
                  </select>
                </label>
                <div className="panel-actions">
                  <ActionButton type="submit" busy={pending === 'context'} busyLabel="Saving…" disabled={busy}>
                    Assign verified context
                  </ActionButton>
                </div>
              </form>
            )}
          </Panel>
          <Panel title="Specialization" kicker={batch.specialization || 'Not set'}>
            <p className="panel-lead">
              This value is not used to choose subjects. Set SWT or NST on each student from Year 3. Existing students
              stay unset until you choose one.
            </p>
            <form
              className="settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.target);
                setPending('specialization');
                academicApi
                  .updateBatch(batch.id, { specialization: form.get('specialization') || null })
                  .then(() => load())
                  .catch((caught) => setError(caught.message || 'Unable to save specialization'))
                  .finally(() => setPending(''));
              }}
            >
              <label>
                Specialization
                <select name="specialization" defaultValue={batch.specialization || ''}>
                  <option value="">Not set</option>
                  <option value="SWT">Software Technologies (SWT)</option>
                  <option value="NST">Network & Security Technologies (NST)</option>
                </select>
              </label>
              <ActionButton type="submit" busy={pending === 'specialization'} busyLabel="Saving…" disabled={busy}>
                Save specialization
              </ActionButton>
            </form>
          </Panel>
          {verified && batch.status === 'ACTIVE' ? (
            <Panel title="Progress batch" kicker="Next semester">
              <p className="panel-lead">
                This moves {batch.code} from {yearLabel}, {batch.currentSemesterName} to the next semester. Active
                students who are in this period move with the batch. Archived students stay where they are. Offerings
                are not generated here.
              </p>
              {progression?.canProgress && progression.next ? (
                <p>
                  Next period: {progression.next.academicYearName}, {progression.next.semesterName}. Active students to
                  advance: {progression.activeStudentsToAdvance}.
                </p>
              ) : (
                <p>{progression?.reason || 'Progression is not available for this batch.'}</p>
              )}
              <div className="panel-actions">
                <ActionButton
                  busy={progressing}
                  busyLabel="Progressing…"
                  disabled={!progression?.canProgress}
                  onClick={() => {
                    const next = progression?.next;
                    const confirmed = window.confirm(
                      `Progress ${batch.code} to ${next?.academicYearName}, ${next?.semesterName}? Active students in the current period move with the batch.`,
                    );
                    if (!confirmed) {
                      return;
                    }
                    setProgressing(true);
                    setProgressResult(null);
                    academicApi
                      .progressBatch(batch.id)
                      .then((response) => {
                        setProgressResult(response.data);
                        setError('');
                        return load();
                      })
                      .catch((caught) => setError(caught.message || 'Unable to progress batch'))
                      .finally(() => setProgressing(false));
                  }}
                >
                  Progress to next semester
                </ActionButton>
              </div>
              {progressResult ? (
                <p className="figure-line" role="status">
                  Moved to {progressResult.to?.academicYearName}, {progressResult.to?.semesterName}. Students advanced{' '}
                  {progressResult.studentsAdvanced}.
                </p>
              ) : null}
            </Panel>
          ) : null}
          {verified && batch.status === 'ACTIVE' ? (
            <Panel title="Generate subject offerings" kicker="Current period only">
              <p className="panel-lead">
                This creates offerings for {batch.code} at {yearLabel}, {batch.currentSemesterName || 'the verified semester'}.
                Existing offerings and lecturer assignments are left as they are.
              </p>
              {preview?.subjects?.length ? (
                <ul className="stack-list">
                  {preview.subjects.map((subject) => (
                    <li key={subject.mappingId}>
                      <span className="stack-item__title">
                        {subject.subjectCode} — {subject.subjectName}
                      </span>
                      <span className="stack-item__meta">
                        {subject.offeringExists ? 'Offering already exists' : 'Will be created'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="deadline-empty">No active curriculum subjects are mapped to this period.</p>
              )}
              {preview?.skipped?.length ? (
                <p className="panel-lead">{preview.skipped.length} mapped subject(s) will be skipped because they are not active.</p>
              ) : null}
              <div className="panel-actions">
                <ActionButton
                  busy={generating}
                  busyLabel="Generating…"
                  onClick={() => {
                    setGenerating(true);
                    setGeneration(null);
                    academicApi
                      .generateOfferings(batch.id)
                      .then((response) => {
                        setGeneration(response.data);
                        setError('');
                        return load();
                      })
                      .catch((caught) => setError(caught.message || 'Unable to generate offerings'))
                      .finally(() => setGenerating(false));
                  }}
                >
                  Generate offerings
                </ActionButton>
              </div>
              {generation ? (
                <p className="figure-line" role="status">
                  Created {generation.created}. Already existed {generation.alreadyExisted}. Skipped {generation.skipped}.
                </p>
              ) : null}
            </Panel>
          ) : null}
          <OfferingEnrollmentRoster batchId={batch.id} years={years} semesters={semesters} />
        </>
      ) : null}
    </section>
  );
}
