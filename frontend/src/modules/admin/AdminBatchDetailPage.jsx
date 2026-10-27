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
  const [contextYearId, setContextYearId] = useState('');
  const [contextSemesterId, setContextSemesterId] = useState('');
  const [editingPeriod, setEditingPeriod] = useState(false);

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
    setEditingPeriod(false);
    setContextYearId('');
    setContextSemesterId('');
    load();
  }, [batchId]);

  if (loading && !batch) {
    return <PageSkeleton title="Batch" variant="list" rows={4} />;
  }

  const verified = Boolean(batch?.academicContextVerifiedAt);
  const yearLabel = batch?.currentAcademicYearName || 'Not set';
  const semesterLabel = batch?.currentSemesterName || 'Not set';
  const periodLabel = verified ? `${yearLabel}, ${semesterLabel}` : 'Not set';
  const semesterChoices = semesters.filter(
    (semester) => semester.status === 'ACTIVE' && contextYearId && semester.academicYearId === contextYearId,
  );

  return (
    <section className="admin-page record-page batch-page">
      <PageHeader
        title={batch ? `${batch.code} — ${batch.name}` : 'Batch'}
        purpose="Student group and progression year."
        actions={<Link to="/admin/academic">Back to academic admin</Link>}
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {batch ? (
        <>
          <div className="stat-row batch-facts">
            <StatCard label="Status" value={batch.status} />
            <StatCard label="Students" value={String(batch.studentCount ?? 0)} />
            <StatCard label="Specialization" value={batch.specialization || 'Not set'} />
            <StatCard label="Current period" value={periodLabel} />
          </div>
          <div className="batch-detail__grid">
          <Panel title="Current period" kicker={verified ? 'Set' : 'Optional'}>
            {verified && !editingPeriod ? (
              <>
                <p className="panel-lead">
                  {batch.code} is at {periodLabel}. Edit period corrects the year and semester. Students stay where they are.
                  Progress batch moves students who are already in this period.
                </p>
                <div className="panel-actions">
                  <ActionButton
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setContextYearId(batch.currentAcademicYearId || '');
                      setContextSemesterId(batch.currentSemesterId || '');
                      setEditingPeriod(true);
                    }}
                  >
                    Edit period
                  </ActionButton>
                </div>
              </>
            ) : (
              <form
                className="settings-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (verified) {
                    const confirmed = window.confirm(
                      `Change ${batch.code} from ${periodLabel}? Students stay in their current period. Offerings stay as they are.`,
                    );
                    if (!confirmed) {
                      return;
                    }
                  }
                  const payload = {
                    currentAcademicYearId: contextYearId,
                    currentSemesterId: contextSemesterId,
                  };
                  const request = verified
                    ? academicApi.reviseBatchContext(batch.id, payload)
                    : academicApi.assignBatchContext(batch.id, payload);
                  setPending('context');
                  request
                    .then(() => {
                      setEditingPeriod(false);
                      return load();
                    })
                    .catch((caught) => setError(caught.message || 'Unable to save the period'))
                    .finally(() => setPending(''));
                }}
              >
                <p className="panel-lead">
                  {verified
                    ? 'Choose the corrected year and semester. Students and offerings stay as they are.'
                    : 'Save a period only when this batch should move forward with its students. Subject offerings do not need it.'}
                </p>
                <label>
                  Academic year
                  <select
                    name="currentAcademicYearId"
                    required
                    value={contextYearId}
                    onChange={(event) => {
                      setContextYearId(event.target.value);
                      setContextSemesterId('');
                    }}
                  >
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
                  <select
                    name="currentSemesterId"
                    required
                    value={contextSemesterId}
                    disabled={!contextYearId}
                    onChange={(event) => setContextSemesterId(event.target.value)}
                  >
                    <option value="" disabled>
                      {contextYearId ? 'Select semester' : 'Select a year first'}
                    </option>
                    {semesterChoices.map((semester) => {
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
                    Save period
                  </ActionButton>
                  {verified ? (
                    <ActionButton type="button" disabled={busy} onClick={() => setEditingPeriod(false)}>
                      Cancel
                    </ActionButton>
                  ) : null}
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
          </div>
          {verified && batch.status === 'ACTIVE' ? (
          <div className="batch-detail__grid">
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
          </div>
          ) : null}
          <OfferingEnrollmentRoster batchId={batch.id} years={years} semesters={semesters} />
        </>
      ) : null}
    </section>
  );
}
