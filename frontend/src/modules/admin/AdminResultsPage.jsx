import { useEffect, useState } from 'react';
import { gpaApi, resultsApi } from '../results/results-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import { StatIcon } from '../../ui/stat-icons.jsx';

const ISSUE_TEXT = {
  STUDENT_NOT_FOUND: 'Registration number is not a student in this department',
  SUBJECT_NOT_FOUND: 'Subject code is not in Academic admin',
  UNKNOWN_RESULT_MARKER: 'Result mark is not recognized',
  MALFORMED_REGISTRATION_NUMBER: 'Registration number format is not valid',
  MISSING_SUBJECT_CODE: 'Subject code is missing',
  MISSING_RESULT_CODE: 'Result is missing',
  STUDENT_OUTSIDE_DEPARTMENT: 'Student belongs to another department',
  INTRA_IMPORT_CONFLICT: 'This registration and subject appear twice with different results',
  INTRA_IMPORT_DUPLICATE: 'This registration and subject are repeated',
  AMBIGUOUS_REPEAT_RESULT: 'An incomplete ESA result cannot be replaced by another incomplete marker',
  DUPLICATE_CA_RECOVERY_PENDING: 'A different CA recovery grade is already waiting for review',
};

function pivotPreviewRows(items = []) {
  const subjects = [];
  const seenSubjects = new Set();
  const students = [];
  const byRegistration = new Map();
  for (const row of items) {
    if (row.subjectCode && !seenSubjects.has(row.subjectCode)) {
      seenSubjects.add(row.subjectCode);
      subjects.push(row.subjectCode);
    }
    const key = row.registrationNumber || 'UNKNOWN';
    let student = byRegistration.get(key);
    if (!student) {
      student = { registrationNumber: key, cells: new Map() };
      byRegistration.set(key, student);
      students.push(student);
    }
    student.cells.set(row.subjectCode, row);
  }
  return {
    subjects,
    students: students.map((student) => {
      const rows = [...student.cells.values()];
      const issues = [];
      const seenIssue = new Set();
      for (const row of rows) {
        for (const code of row.validationErrors || []) {
          const issueKey = `${code}|${row.subjectCode}`;
          if (seenIssue.has(issueKey)) {
            continue;
          }
          seenIssue.add(issueKey);
          issues.push({ code, subjectCode: row.subjectCode });
        }
      }
      const statuses = new Set(rows.map((row) => row.rowStatus).filter(Boolean));
      const actions = new Set(rows.map((row) => row.proposedAction).filter(Boolean));
      return {
        registrationNumber: student.registrationNumber,
        cells: student.cells,
        issues,
        status: statuses.has('BLOCKED') ? 'BLOCKED' : statuses.has('WARNING') ? 'WARNING' : [...statuses][0] || '—',
        action: actions.size === 1 ? [...actions][0] : [...actions].sort().join(', '),
      };
    }),
  };
}

function ReviewSheet({ items, onViewIssues }) {
  const sheet = pivotPreviewRows(items);
  if (!sheet.students.length) {
    return <p>No preview rows yet.</p>;
  }
  return (
    <div className="table-scroll review-sheet-scroll">
      <table className="data-table review-sheet">
        <thead>
          <tr>
            <th className="review-sheet__registration">Registration</th>
            {sheet.subjects.map((subjectCode) => (
              <th key={subjectCode} className="review-sheet__subject" title={subjectCode}>
                <span>{subjectCode}</span>
              </th>
            ))}
            <th>Status</th>
            <th>Action</th>
            <th>Issues</th>
          </tr>
        </thead>
        <tbody>
          {sheet.students.map((student) => (
            <tr key={student.registrationNumber}>
              <td className="review-sheet__registration">{student.registrationNumber}</td>
              {sheet.subjects.map((subjectCode) => {
                const cell = student.cells.get(subjectCode);
                const blocked = cell?.rowStatus === 'BLOCKED';
                return (
                  <td key={subjectCode} className={blocked ? 'review-sheet__cell is-blocked' : 'review-sheet__cell'}>
                    {cell?.resultCode || '—'}
                    {cell?.gradeCapApplied ? (
                      <span className="review-sheet__note">
                        {' '}
                        raw {cell.rawResultCode}; official {cell.officialResultCode} (C Pass)
                      </span>
                    ) : null}
                    {cell?.reviewRequired && cell?.proposedAction === 'REVIEW' ? (
                      <span className="review-sheet__note"> pending review; official stays E(CA)</span>
                    ) : null}
                    {cell?.explanation && (cell.gradeCapApplied || cell.reviewRequired || cell.rowStatus === 'BLOCKED') ? (
                      <span className="review-sheet__note"> {cell.explanation}</span>
                    ) : null}
                  </td>
                );
              })}
              <td>{student.status}</td>
              <td>{student.action}</td>
              <td>
                <button type="button" disabled={!student.issues.length} onClick={() => onViewIssues(student)}>
                  View issues
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FAILURE_TEXT = {
  NO_TEXT: 'This PDF has no selectable result text. A scanned image cannot be committed. Upload a text PDF or an XLSX sheet.',
  NO_ROWS: 'No registration, subject, and result rows were found, so there is nothing to commit.',
  UNSAFE_FILE: 'The malware scan rejected this file.',
  FILE_MISSING: 'The uploaded file is missing.',
  PARSE_EXCEPTION: 'The file could not be parsed.',
};

function summaryLine(summary = {}) {
  return [
    `Parsed ${summary.totalRows ?? 0}`,
    `valid ${summary.validRows ?? 0}`,
    `blocked ${summary.blockedRows ?? 0}`,
    `new ${summary.newRows ?? 0}`,
    `updates ${summary.updateRows ?? 0}`,
    `unchanged ${summary.unchangedRows ?? 0}`,
    `conflicts ${summary.conflictRows ?? 0}`,
    `duplicates ${summary.duplicateRows ?? 0}`,
    `E(CA) ${summary.ecaRows ?? 0}`,
  ].join(' · ');
}

export function AdminResultsPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [gpaQuality, setGpaQuality] = useState(null);
  const [issues, setIssues] = useState(null);
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState(null);
  const [versions, setVersions] = useState(null);
  const [chosenFile, setChosenFile] = useState(null);
  const [issueStudent, setIssueStudent] = useState(null);

  async function reload() {
    const response = await resultsApi.imports();
    setItems(response.data.items);
  }

  async function openPreview(id) {
    setSelectedId(id);
    setVersions(null);
    setIssueStudent(null);
    const response = await resultsApi.preview(id, { pageSize: 2000 });
    setPreview(response.data);
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load result imports');
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
  }, []);

  if (loading) {
    return <PageSkeleton title="Official result imports" variant="list" rows={6} />;
  }

  const status = preview?.import?.processingStatus;
  const canCommit = status && !['COMMITTED', 'COMMITTING', 'CANCELLED', 'REJECTED_FILE'].includes(status);
  const canReject = status && !['COMMITTED', 'COMMITTING', 'CANCELLED'].includes(status);
  const canReprocess = status && !['COMMITTED', 'COMMITTING'].includes(status);

  return (
    <section className="admin-page record-page results-imports">
      <PageHeader
        title="Official result imports"
        purpose="Upload a file, review matches, then commit only new or updated official rows."
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="results-imports__top">
        <Panel title="Upload file" kicker="PDF or XLSX">
          <form
            className="import-upload"
            onSubmit={(event) => {
              event.preventDefault();
              const file = chosenFile || event.target.file.files[0];
              if (!file) {
                setError('Choose a PDF or XLSX file');
                return;
              }
              const formData = new FormData();
              formData.append('file', file);
              setBusy(true);
              resultsApi
                .createImport(formData)
                .then((response) => {
                  setError('');
                  setChosenFile(null);
                  event.target.reset();
                  return reload().then(() => openPreview(response.data.id));
                })
                .catch((caught) => setError(caught.message || 'Import failed'))
                .finally(() => setBusy(false));
            }}
          >
            <p className="panel-lead">Choose one department result file to parse.</p>
            <label className="import-upload__drop">
              <StatIcon name="imports" className="import-upload__icon" />
              <span className="import-upload__copy">
                <span className="import-upload__title">
                  {chosenFile ? chosenFile.name : 'Choose PDF or XLSX'}
                </span>
                <span className="import-upload__meta">
                  {chosenFile
                    ? `${Math.max(1, Math.round(chosenFile.size / 1024))} KB selected`
                    : 'Browse from your computer'}
                </span>
              </span>
              <input
                className="import-upload__input"
                type="file"
                name="file"
                accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => setChosenFile(event.target.files?.[0] || null)}
              />
            </label>
            <div className="import-upload__actions">
              <button type="submit" disabled={busy || !chosenFile}>
                {busy ? 'Uploading…' : 'Upload and parse'}
              </button>
              {chosenFile ? (
                <button
                  type="button"
                  className="text-action"
                  disabled={busy}
                  onClick={() => setChosenFile(null)}
                >
                  Clear
                </button>
              ) : null}
            </div>
          </form>
        </Panel>

        <Panel title="Import history" kicker={`${items.length} file${items.length === 1 ? '' : 's'}`}>
          {items.length === 0 ? (
            <EmptyState>No imports yet. Upload a result file to start the review pipeline.</EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Rows</th>
                    <th>Unmatched</th>
                    <th>E(CA)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className={selectedId === item.id ? 'is-selected' : undefined}>
                      <td>
                        <span className="status-pill">{item.processingStatus}</span>
                      </td>
                      <td>{item.sourceType}</td>
                      <td>{item.summary?.totalRows ?? 0}</td>
                      <td>{item.summary?.unmatchedRows ?? 0}</td>
                      <td>{item.summary?.ecaRows ?? 0}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => openPreview(item.id).catch((caught) => setError(caught.message))}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      {preview ? (
        <Panel title="Review" kicker={preview.import.processingStatus}>
          <p>
            {preview.import.processingStatus}
            {preview.import.parserVersion ? ` · parser ${preview.import.parserVersion}` : ''}
            {preview.import.processingAttempt ? ` · attempt ${preview.import.processingAttempt}` : ''}
          </p>
          <p>{summaryLine(preview.import.summary)}</p>
          {preview.import.originalFilename ? <p>File: {preview.import.originalFilename}</p> : null}
          {preview.import.duplicateOfImportId ? (
            <p>This file checksum matches a previously committed import. Review before committing.</p>
          ) : null}
          {preview.import.failureCode ? (
            <p>{FAILURE_TEXT[preview.import.failureCode] || preview.import.failureCode}</p>
          ) : null}
          <ReviewSheet items={preview.items} onViewIssues={setIssueStudent} />
          {issueStudent ? (
            <div className="review-issues" role="dialog" aria-label={`Issues for ${issueStudent.registrationNumber}`}>
              <div className="review-issues__head">
                <strong>{issueStudent.registrationNumber}</strong>
                <button type="button" onClick={() => setIssueStudent(null)}>
                  Close
                </button>
              </div>
              {issueStudent.issues.length === 0 ? (
                <p>No issues for this registration.</p>
              ) : (
                <ul>
                  {[...issueStudent.issues.reduce((groups, issue) => {
                    const subjects = groups.get(issue.code) || [];
                    subjects.push(issue.subjectCode);
                    groups.set(issue.code, subjects);
                    return groups;
                  }, new Map())].map(([code, subjects]) => (
                    <li key={code}>
                      <span>{subjects.join(', ')}</span>
                      {ISSUE_TEXT[code] || code}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <div className="page-header__actions">
            {canCommit ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Commit new and updated official results in this import? Blocked rows stay out.')) {
                    return;
                  }
                  setBusy(true);
                  resultsApi
                    .commit(selectedId)
                    .then(() => openPreview(selectedId).then(reload))
                    .catch(async (caught) => {
                      setError(caught.message || 'Commit failed');
                      await openPreview(selectedId).then(reload).catch(() => {});
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Commit new and updated rows
              </button>
            ) : null}
            {canReprocess ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Reprocess this same file? Previous preview rows for this import are replaced. Official results are not changed.')) {
                    return;
                  }
                  setBusy(true);
                  resultsApi
                    .reprocess(selectedId)
                    .then(() => openPreview(selectedId).then(reload))
                    .catch((caught) => setError(caught.message || 'Reprocess failed'))
                    .finally(() => setBusy(false));
                }}
              >
                Reprocess file
              </button>
            ) : null}
            {canReject ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Reject this import? It will not be committed. Official results already stored stay as they are.')) {
                    return;
                  }
                  setBusy(true);
                  resultsApi
                    .reject(selectedId)
                    .then(() => openPreview(selectedId).then(reload))
                    .catch((caught) => setError(caught.message || 'Reject failed'))
                    .finally(() => setBusy(false));
                }}
              >
                Reject import
              </button>
            ) : null}
            {status === 'COMMITTED' ? <p>This import is committed.</p> : null}
          </div>
        </Panel>
      ) : null}
      <Panel title="Official records" kicker="Lookup">
        <form
          className="import-search"
          onSubmit={(event) => {
            event.preventDefault();
            const value = query.trim();
            if (!value) {
              setError('Enter a registration number or subject code');
              return;
            }
            const params = value.includes('/') ? { registrationNumber: value } : { subjectCode: value };
            setBusy(true);
            resultsApi
              .records(params)
              .then((response) => {
                setError('');
                setRecords(response.data);
                setVersions(null);
              })
              .catch((caught) => setError(caught.message || 'Search failed'))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Registration number or subject code
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. SEU/IS/19/IS/001 or CSC1101"
              autoComplete="off"
            />
          </label>
          <button type="submit" disabled={busy}>
            Search
          </button>
        </form>
        {records ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Subject</th>
                <th>Result</th>
                <th>Version</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.registrationNumber}</td>
                  <td>{row.subjectCode}</td>
                  <td>{row.resultCode}</td>
                  <td>{row.version}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() =>
                        resultsApi
                          .versions(row.id)
                          .then((response) => setVersions(response.data))
                          .catch((caught) => setError(caught.message))
                      }
                    >
                      History
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {versions ? (
          <div>
            <p>
              Current {versions.current.resultCode} for {versions.current.registrationNumber} {versions.current.subjectCode}
            </p>
            <ul className="stack-list">
              {versions.versions.map((item) => (
                <li key={item.id}>
                  {item.previousResultCode || '—'} → {item.newResultCode}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>
      <Panel>
        <h2>GPA calculation checks</h2>
        <p>Counts only. This does not rank students and does not edit a GPA by hand.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            gpaApi
              .quality()
              .then((response) => setGpaQuality(response.data))
              .catch((caught) => setError(caught.message))
          }
        >
          Load GPA checks
        </button>
        {gpaQuality ? (
          <p>
            Current {gpaQuality.current}. Unavailable {gpaQuality.unavailable}. Stale {gpaQuality.stale}. Missing
            snapshot {gpaQuality.missingSnapshot}. Unknown grades {gpaQuality.unknownGradeRows}.
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!window.confirm('Rebuild GPA snapshots for students in this department from current official results?')) {
              return;
            }
            setBusy(true);
            gpaApi
              .rebuild()
              .then((response) => {
                setGpaQuality(null);
                setError('');
                return gpaApi.quality().then((quality) => {
                  setGpaQuality(quality.data);
                  setError(response.data.failed ? `${response.data.failed} rebuilds failed.` : '');
                });
              })
              .catch((caught) => setError(caught.message || 'Rebuild failed'))
              .finally(() => setBusy(false));
          }}
        >
          Rebuild department GPA
        </button>
      </Panel>
      <Panel>
        <h2>Department result counts</h2>
        <button
          type="button"
          onClick={() =>
            Promise.all([resultsApi.analytics(), resultsApi.reconciliation()])
              .then(([counts, report]) => {
                setAnalytics(counts.data);
                setIssues(report.data);
              })
              .catch((caught) => setError(caught.message))
          }
        >
          Load counts and checks
        </button>
        {analytics ? (
          <p>
            Official rows {analytics.officialResultCount}. E(CA) {analytics.ecaCount}. Revisions {analytics.revisionCount}.
          </p>
        ) : null}
        {analytics?.gradeDistribution?.length ? (
          <ul className="stack-list">
            {analytics.gradeDistribution.map((row) => (
              <li key={row.resultCode}>
                {row.resultCode}: {row.count}
              </li>
            ))}
          </ul>
        ) : null}
        {issues ? <p>Checks: {issues.issueCount}</p> : null}
        {issues?.issues?.length ? (
          <ul className="stack-list">
            {issues.issues.map((issue) => (
              <li key={`${issue.issue}-${issue.entityId}`}>
                {issue.issue}
                {issue.registrationNumber ? ` · ${issue.registrationNumber}` : ''}
                {issue.subjectCode ? ` · ${issue.subjectCode}` : ''}. {issue.recommendedAction}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </section>
  );
}
