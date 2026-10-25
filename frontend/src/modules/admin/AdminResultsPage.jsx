import { useEffect, useRef, useState } from 'react';
import { gpaApi, resultsApi } from '../results/results-api.js';
import { formatSemesterLabel } from '../../ui/academic-labels.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { OperationNotice } from '../../ui/OperationNotice.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton, SkeletonLine } from '../../ui/Skeleton.jsx';
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

function LoadingPanel({ label }) {
  return (
    <div className="loading-panel" aria-busy="true" aria-live="polite">
      <p className="loading-panel__label">{label}</p>
      <SkeletonLine />
      <SkeletonLine width="78%" />
      <SkeletonLine width="54%" />
    </div>
  );
}

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

function formatImportStatus(status) {
  const label = String(status || '')
    .toLowerCase()
    .replaceAll('_', ' ');
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '—';
}

function sheetTone(value) {
  if (value === 'BLOCKED' || value === 'SKIP') {
    return 'sheet-pill sheet-pill--bad';
  }
  if (value === 'WARNING' || value === 'REVIEW' || value === 'UPDATE') {
    return 'sheet-pill sheet-pill--warn';
  }
  if (value === 'VALID' || value === 'NEW' || value === 'UNCHANGED') {
    return 'sheet-pill sheet-pill--ok';
  }
  return 'sheet-pill';
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
              <td>
                <span className={sheetTone(student.status)}>{formatImportStatus(student.status)}</span>
              </td>
              <td>
                <span className={sheetTone(student.action)}>{formatImportStatus(student.action)}</span>
              </td>
              <td>
                {student.issues.length ? (
                  <button type="button" className="review-sheet__issues" onClick={() => onViewIssues(student)}>
                    {student.issues.length} {student.issues.length === 1 ? 'issue' : 'issues'}
                  </button>
                ) : (
                  <span className="review-sheet__quiet">None</span>
                )}
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
  SCAN_UNAVAILABLE: 'The file could not be scanned, so it was not parsed.',
};

const QUEUED_IMPORT_STATUSES = ['UPLOADED', 'PROCESSING', 'COMMITTING'];

function importStatusClass(status) {
  switch (status) {
    case 'COMMITTED':
      return 'status-pill status-pill--ok';
    case 'READY_FOR_REVIEW':
    case 'CONFIRMED':
    case 'PARSED':
      return 'status-pill status-pill--info';
    case 'UPLOADED':
    case 'PROCESSING':
    case 'COMMITTING':
      return 'status-pill status-pill--pending';
    case 'VALIDATION_ISSUES':
      return 'status-pill status-pill--warning';
    case 'PARSE_FAILED':
    case 'COMMIT_FAILED':
    case 'FAILED':
    case 'REJECTED_FILE':
      return 'status-pill status-pill--danger';
    default:
      return 'status-pill status-pill--muted';
  }
}

function formatResultPeriod(period) {
  if (!period) {
    return '';
  }
  const year =
    period.academicYearName || period.academicYearSequence != null
      ? { name: period.academicYearName, sequence: period.academicYearSequence }
      : null;
  const semester =
    period.semesterName || period.semesterSequence != null
      ? { name: period.semesterName, sequence: period.semesterSequence }
      : null;
  const batch = period.batchCode || period.batchName || '';
  const periodLabel = formatSemesterLabel(semester, year);
  return [batch, periodLabel].filter(Boolean).join(' · ');
}

function formatResultPeriods(periods = []) {
  const labels = periods.map(formatResultPeriod).filter(Boolean);
  return labels.length ? labels.join('; ') : '—';
}

const SUMMARY_STATS = [
  ['totalRows', 'Parsed'],
  ['validRows', 'Valid'],
  ['blockedRows', 'Blocked'],
  ['newRows', 'New'],
  ['updateRows', 'Updates'],
  ['unchangedRows', 'Unchanged'],
  ['conflictRows', 'Conflicts'],
  ['duplicateRows', 'Duplicates'],
  ['ecaRows', 'E(CA)'],
];

export function AdminResultsPage() {
  const [error, setError] = useState('');
  const [notices, setNotices] = useState({});
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState(null);
  const [pending, setPending] = useState('');
  const busy = Boolean(pending);
  const [analytics, setAnalytics] = useState(null);
  const [gpaQuality, setGpaQuality] = useState(null);
  const [issues, setIssues] = useState(null);
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState(null);
  const [versions, setVersions] = useState(null);
  const [chosenFile, setChosenFile] = useState(null);
  const [issueStudent, setIssueStudent] = useState(null);
  const resumeStarted = useRef('');

  function report(key, tone, message) {
    setNotices((current) => ({ ...current, [key]: { tone, message } }));
  }

  async function reload() {
    const response = await resultsApi.imports({ pageSize: 50 });
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
    if (!items.some((item) => QUEUED_IMPORT_STATUSES.includes(item.processingStatus))) {
      return undefined;
    }
    const timer = setInterval(() => {
      reload().catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [items]);

  useEffect(() => {
    if (!QUEUED_IMPORT_STATUSES.includes(preview?.import?.processingStatus) || !selectedId) {
      return undefined;
    }
    const timer = setInterval(() => {
      openPreview(selectedId)
        .then(() => reload())
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [preview?.import?.processingStatus, selectedId]);

  useEffect(() => {
    const stuck = items.find((item) => item.processingStatus === 'COMMITTING' && item.commitStale);
    if (!stuck || resumeStarted.current === stuck.id) {
      return undefined;
    }
    resumeStarted.current = stuck.id;
    let cancelled = false;
    setPending('resume');
    resultsApi
      .commit(stuck.id)
      .then((response) => {
        if (cancelled) {
          return null;
        }
        const nextStatus = response?.data?.processingStatus;
        report(
          'review',
          nextStatus === 'COMMITTED' ? 'success' : 'failure',
          nextStatus === 'COMMITTED'
            ? 'The stopped commit finished. Official rows are stored.'
            : 'The stopped commit could not be finished.',
        );
        return reload().then(() => (selectedId === stuck.id ? openPreview(stuck.id) : null));
      })
      .catch((caught) => {
        if (!cancelled) {
          report('review', 'failure', caught.message || 'The stopped commit could not be finished.');
          return reload();
        }
        return null;
      })
      .finally(() => {
        if (!cancelled) {
          setPending('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [items, selectedId]);

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

  const openingId = pending.startsWith('review:') ? pending.slice('review:'.length) : '';
  const reviewOpening = Boolean(openingId) && preview?.import?.id !== openingId;
  const status = preview?.import?.processingStatus;
  const queueBusy = items.some((item) => item.processingStatus === 'UPLOADED' || item.processingStatus === 'PROCESSING');
  const canCommit = status && !['COMMITTED', 'COMMITTING', 'CANCELLED', 'REJECTED_FILE', 'UPLOADED', 'PROCESSING'].includes(status);
  const canReject = status && !['COMMITTED', 'COMMITTING', 'CANCELLED'].includes(status);
  const canReprocess = status && !['COMMITTED', 'COMMITTING'].includes(status);
  const committedCount = items.filter((item) => item.processingStatus === 'COMMITTED').length;
  const totalParsedRows = items.reduce((sum, item) => sum + (item.summary?.totalRows || 0), 0);
  const totalUnmatchedRows = items.reduce((sum, item) => sum + (item.summary?.unmatchedRows || 0), 0);
  const totalFlaggedEca = items.reduce((sum, item) => sum + (item.summary?.ecaRows || 0), 0);
  const matchedRate = totalParsedRows > 0
    ? Math.max(0, Math.min(100, Math.round(((totalParsedRows - totalUnmatchedRows) / totalParsedRows) * 100)))
    : 100;

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

      <div className="stat-row">
        <StatCard label="Import files" value={items.length} icon="imports" />
        <StatCard label="Committed sheets" value={committedCount} icon="academic" />
        <StatCard label="Rows parsed" value={totalParsedRows} icon="subjects" />
        <StatCard label="E(CA) rows in files" value={totalFlaggedEca} icon="eca" tone="watch" />
      </div>

      <Panel title="Upload file" kicker="PDF or XLSX">
        <form
          className="import-upload import-upload--wide"
          onSubmit={(event) => {
            event.preventDefault();
            const file = chosenFile || event.target.file.files[0];
            if (!file) {
              report('upload', 'failure', 'Choose a PDF or XLSX file before uploading.');
              return;
            }
            const formData = new FormData();
            formData.append('file', file);
            setPending('upload');
            resultsApi
              .createImport(formData)
              .then((response) => {
                setChosenFile(null);
                event.target.reset();
                const nextStatus = response.data.processingStatus || 'processed';
                report('upload', 'success', `Result file uploaded. Status is ${nextStatus}.`);
                return reload().then(() => openPreview(response.data.id));
              })
              .catch((caught) => report('upload', 'failure', caught.message || 'Result file could not be uploaded.'))
              .finally(() => setPending(''));
          }}
        >
          <div className="import-upload__info">
            <p className="panel-lead panel-lead--tight">
              Download the template, fill the Results and Repeaters sheets, then upload the file.
            </p>
            <div className="import-pipeline-meter">
              <div className="import-pipeline-meter__head">
                <span>Matched student rows across imports</span>
                <strong>{matchedRate}% matched</strong>
              </div>
              <div className="import-pipeline-meter__track" aria-hidden="true">
                <span className="import-pipeline-meter__fill" style={{ width: `${matchedRate}%` }} />
              </div>
            </div>
            <div className="import-upload__actions">
              <ActionButton
                busy={pending === 'template'}
                busyLabel="Downloading…"
                disabled={busy && pending !== 'template'}
                onClick={() => {
                  setPending('template');
                  resultsApi
                    .downloadTemplate()
                    .then(() =>
                      report('upload', 'success', 'Template downloaded. Fill the Results and Repeaters sheets, then upload the file.'),
                    )
                    .catch((caught) => report('upload', 'failure', caught.message || 'Template could not be downloaded.'))
                    .finally(() => setPending(''));
                }}
              >
                Download XLSX template
              </ActionButton>
              <ActionButton
                type="submit"
                className={pending === 'upload' || queueBusy ? 'is-busy' : undefined}
                busy={pending === 'upload' || queueBusy}
                busyLabel="Processing…"
                disabled={!chosenFile}
              >
                Upload and parse
              </ActionButton>
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
            <OperationNotice notice={notices.upload} />
          </div>
          <label className="import-upload__drop">
            <StatIcon name="imports" className="import-upload__icon" />
            <span className="import-upload__copy">
              <span className="import-upload__title">
                {chosenFile ? chosenFile.name : 'Choose PDF or XLSX'}
              </span>
              <span className="import-upload__meta">
                {chosenFile
                  ? `${Math.max(1, Math.round(chosenFile.size / 1024))} KB selected`
                  : 'Browse or drop file from your computer'}
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
                  <th>Batch and semester</th>
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
                    <td className="keep">
                      <span className={importStatusClass(item.processingStatus)}>{formatImportStatus(item.processingStatus)}</span>
                    </td>
                    <td>
                      {(() => {
                        const text = formatResultPeriods(item.resultPeriods);
                        if (text === '—') {
                          return <span className="review-sheet__quiet">—</span>;
                        }
                        const parts = text.split('; ').filter(Boolean);
                        const first = parts[0];
                        const extra = parts.length - 1;
                        return (
                          <div className="period-chip-list" title={text}>
                            <span className="period-chip">{first}</span>
                            {extra > 0 ? (
                              <span className="period-chip period-chip--more">
                                +{extra} more
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="keep">
                      <span className="status-pill status-pill--muted">{item.sourceType}</span>
                    </td>
                    <td className="keep">{item.summary?.totalRows ?? 0}</td>
                    <td className="keep">{item.summary?.unmatchedRows ?? 0}</td>
                    <td className="keep">{item.summary?.ecaRows ?? 0}</td>
                    <td className="keep">
                      <ActionButton
                        busy={pending === `review:${item.id}`}
                        busyLabel="Opening…"
                        disabled={busy && pending !== `review:${item.id}`}
                        onClick={() => {
                          setPending(`review:${item.id}`);
                          openPreview(item.id)
                            .catch((caught) =>
                              report('review', 'failure', caught.message || 'This import could not be opened for review.'),
                            )
                            .finally(() => setPending(''));
                        }}
                      >
                        Review
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {reviewOpening ? (
        <Panel title="Review" kicker="Opening sheet">
          <LoadingPanel label="Opening this result sheet…" />
        </Panel>
      ) : preview ? (
        <Panel
          title={preview.import.originalFilename || 'Review'}
          kicker={
            formatResultPeriods(preview.import.resultPeriods) === '—'
              ? 'Result sheet'
              : formatResultPeriods(preview.import.resultPeriods)
          }
        >
          <div className="review-head">
            <span className={importStatusClass(status)}>{formatImportStatus(status)}</span>
            <p className="review-head__meta">
              {preview.import.parserVersion ? `Parser ${preview.import.parserVersion}` : 'Parsed sheet'}
              {preview.import.processingAttempt ? ` · Attempt ${preview.import.processingAttempt}` : ''}
            </p>
          </div>
          <dl className="result-summary__stats review-summary">
            {SUMMARY_STATS.map(([key, label]) => {
              const value = preview.import.summary?.[key] ?? 0;
              const attention = ['blockedRows', 'conflictRows', 'duplicateRows'].includes(key) && value > 0;
              return (
                <div key={key} className={attention ? 'is-attention' : undefined}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              );
            })}
          </dl>
          {status === 'COMMITTING' ? (
            <p className="review-callout">
              {preview.import.commitStale ? 'The previous commit stopped before it finished.' : 'Commit in progress.'}
            </p>
          ) : null}
          {preview.import.duplicateOfImportId ? (
            <p className="review-callout">This file matches a previously committed import. Review it before committing.</p>
          ) : null}
          {preview.import.failureCode ? (
            <p className="review-callout review-callout--danger">
              {FAILURE_TEXT[preview.import.failureCode] || preview.import.failureCode}
            </p>
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
            {canCommit || (status === 'COMMITTING' && preview.import.commitStale) ? (
              <ActionButton
                busy={pending === 'commit' || pending === 'resume'}
                busyLabel={pending === 'resume' ? 'Resuming…' : 'Committing…'}
                disabled={busy}
                onClick={() => {
                  const resuming = status === 'COMMITTING';
                  if (
                    !window.confirm(
                      resuming
                        ? 'Resume this commit? Rows already written are kept, and the remaining new or updated rows are stored.'
                        : 'Commit new and updated official results in this import? Blocked rows stay out.',
                    )
                  ) {
                    return;
                  }
                  setPending('commit');
                  const timer = setInterval(() => {
                    openPreview(selectedId)
                      .then(() => reload())
                      .catch(() => {});
                  }, 3000);
                  resultsApi
                    .commit(selectedId)
                    .then((response) => {
                      const nextStatus = response.data?.processingStatus;
                      report(
                        'review',
                        nextStatus === 'COMMITTED' ? 'success' : 'failure',
                        nextStatus === 'COMMITTED'
                          ? 'Import committed. New and updated official rows are stored.'
                          : `Import was not committed. Status is ${nextStatus || 'unchanged'}.`,
                      );
                      return openPreview(selectedId).then(reload);
                    })
                    .catch(async (caught) => {
                      report('review', 'failure', caught.message || 'Import could not be committed.');
                      await openPreview(selectedId).then(reload).catch(() => {});
                    })
                    .finally(() => {
                      clearInterval(timer);
                      setPending('');
                    });
                }}
              >
                {status === 'COMMITTING' ? 'Resume commit' : 'Commit new and updated rows'}
              </ActionButton>
            ) : null}
            {canReprocess ? (
              <ActionButton
                busy={pending === 'reprocess'}
                busyLabel="Reprocessing…"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Reprocess this same file? Previous preview rows for this import are replaced. Official results are not changed.')) {
                    return;
                  }
                  setPending('reprocess');
                  resultsApi
                    .reprocess(selectedId)
                    .then(() => {
                      report('review', 'success', 'Import reprocessed. Review the new preview before committing.');
                      return openPreview(selectedId).then(reload);
                    })
                    .catch((caught) => report('review', 'failure', caught.message || 'Import could not be reprocessed.'))
                    .finally(() => setPending(''));
                }}
              >
                Reprocess file
              </ActionButton>
            ) : null}
            {canReject ? (
              <ActionButton
                busy={pending === 'reject'}
                busyLabel="Rejecting…"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Reject this import? It will not be committed. Official results already stored stay as they are.')) {
                    return;
                  }
                  setPending('reject');
                  resultsApi
                    .reject(selectedId)
                    .then(() => {
                      report('review', 'success', 'Import rejected. Official results already stored were not changed.');
                      return openPreview(selectedId).then(reload);
                    })
                    .catch((caught) => report('review', 'failure', caught.message || 'Import could not be rejected.'))
                    .finally(() => setPending(''));
                }}
              >
                Reject import
              </ActionButton>
            ) : null}
            {status === 'COMMITTED' ? <p>This import is committed.</p> : null}
          </div>
          <OperationNotice notice={notices.review} />
        </Panel>
      ) : null}
      <Panel title="Official records" kicker="Lookup">
        <form
          className="import-search"
          onSubmit={(event) => {
            event.preventDefault();
            const value = query.trim();
            if (!value) {
              report('search', 'failure', 'Enter a registration number or subject code.');
              return;
            }
            const params = value.includes('/') ? { registrationNumber: value } : { subjectCode: value };
            setPending('search');
            resultsApi
              .records(params)
              .then((response) => {
                const count = response.data?.items?.length || 0;
                setRecords(response.data);
                setVersions(null);
                report(
                  'search',
                  'success',
                  count ? `Official records loaded. ${count} row${count === 1 ? '' : 's'} matched.` : 'Official records loaded. No rows matched.',
                );
              })
              .catch((caught) => report('search', 'failure', caught.message || 'Official records could not be loaded.'))
              .finally(() => setPending(''));
          }}
        >
          <label>
            Registration number or subject code
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type a registration number or subject code"
              autoComplete="off"
            />
          </label>
          <ActionButton type="submit" busy={pending === 'search'} busyLabel="Searching…" disabled={busy}>
            Search
          </ActionButton>
        </form>
        <OperationNotice notice={notices.search} />
        {pending === 'search' ? <LoadingPanel label="Looking up official records…" /> : null}
        {records ? (
          <div className="table-scroll">
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
                    <td className="keep">{row.registrationNumber}</td>
                    <td className="keep">{row.subjectCode}</td>
                    <td className="keep">{row.resultCode}</td>
                    <td className="keep">{row.version}</td>
                    <td className="keep">
                      <ActionButton
                        busy={pending === `history:${row.id}`}
                        busyLabel="Loading…"
                        disabled={busy && pending !== `history:${row.id}`}
                        onClick={() => {
                          setPending(`history:${row.id}`);
                          resultsApi
                            .versions(row.id)
                            .then((response) => {
                              setVersions(response.data);
                              report('search', 'success', 'Result history loaded.');
                            })
                            .catch((caught) => report('search', 'failure', caught.message || 'Result history could not be loaded.'))
                            .finally(() => setPending(''));
                        }}
                      >
                        History
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      <div className="dashboard-grid dashboard-grid--primary">
        <Panel title="GPA calculation checks" kicker="Quality & snapshots">
          <p className="panel-lead">Counts only. This does not rank students and does not edit a GPA by hand.</p>
          <div className="import-upload__actions">
            <ActionButton
              busy={pending === 'gpa'}
              busyLabel="Loading checks…"
              disabled={busy}
              onClick={() => {
                setPending('gpa');
                gpaApi
                  .quality()
                  .then((response) => {
                    setGpaQuality(response.data);
                    report('gpa', 'success', 'GPA checks loaded.');
                  })
                  .catch((caught) => report('gpa', 'failure', caught.message || 'GPA checks could not be loaded.'))
                  .finally(() => setPending(''));
              }}
            >
              Load GPA checks
            </ActionButton>
            <ActionButton
              busy={pending === 'rebuild'}
              busyLabel="Rebuilding…"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Rebuild GPA snapshots for students in this department from current official results?')) {
                  return;
                }
                setPending('rebuild');
                gpaApi
                  .rebuild()
                  .then((response) => {
                    const failed = response.data?.failed || 0;
                    const calculated = response.data?.calculated || 0;
                    return gpaApi.quality().then((quality) => {
                      setGpaQuality(quality.data);
                      report(
                        'gpa',
                        failed ? 'failure' : 'success',
                        failed
                          ? `Department GPA rebuild finished with ${failed} student${failed === 1 ? '' : 's'} not recalculated.`
                          : `Department GPA rebuilt for ${calculated} student${calculated === 1 ? '' : 's'}.`,
                      );
                    });
                  })
                  .catch((caught) => report('gpa', 'failure', caught.message || 'Department GPA could not be rebuilt.'))
                  .finally(() => setPending(''));
              }}
            >
              Rebuild department GPA
            </ActionButton>
          </div>
          <OperationNotice notice={notices.gpa} />
          {pending === 'gpa' || pending === 'rebuild' ? (
            <LoadingPanel label={pending === 'rebuild' ? 'Rebuilding department GPA…' : 'Loading GPA checks…'} />
          ) : null}
          {gpaQuality ? (
            <div className="result-summary">
              <dl className="result-summary__stats">
                <div>
                  <dt>Current</dt>
                  <dd>{gpaQuality.current}</dd>
                </div>
                <div>
                  <dt>Unavailable</dt>
                  <dd>{gpaQuality.unavailable}</dd>
                </div>
                <div>
                  <dt>Stale</dt>
                  <dd>{gpaQuality.stale}</dd>
                </div>
                <div>
                  <dt>Missing snapshot</dt>
                  <dd>{gpaQuality.missingSnapshot}</dd>
                </div>
                <div>
                  <dt>Unknown grades</dt>
                  <dd>{gpaQuality.unknownGradeRows}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </Panel>
        <Panel title="Department result counts" kicker="Reconciliation">
          <p className="panel-lead">Inspect official result row totals, grade distribution, and reconciliation checks.</p>
          <div className="import-upload__actions">
            <ActionButton
              busy={pending === 'counts'}
              busyLabel="Loading counts…"
              disabled={busy}
              onClick={() => {
                setPending('counts');
                Promise.all([resultsApi.analytics(), resultsApi.reconciliation()])
                  .then(([counts, reconciliation]) => {
                    setAnalytics(counts.data);
                    setIssues(reconciliation.data);
                    const issueCount = reconciliation.data?.issueCount || 0;
                    report(
                      'counts',
                      'success',
                      issueCount
                        ? `Department result counts loaded. ${issueCount} check${issueCount === 1 ? '' : 's'} need attention.`
                        : 'Department result counts loaded. No checks need attention.',
                    );
                  })
                  .catch((caught) => report('counts', 'failure', caught.message || 'Department result counts could not be loaded.'))
                  .finally(() => setPending(''));
              }}
            >
              Load counts and checks
            </ActionButton>
          </div>
          <OperationNotice notice={notices.counts} />
          {pending === 'counts' ? <LoadingPanel label="Loading department result counts…" /> : null}
          {analytics ? (
            <div className="result-summary">
              <dl className="result-summary__stats">
                <div>
                  <dt>Official rows</dt>
                  <dd>{analytics.officialResultCount}</dd>
                </div>
                <div>
                  <dt>E(CA)</dt>
                  <dd>{analytics.ecaCount}</dd>
                </div>
                <div>
                  <dt>Revisions</dt>
                  <dd>{analytics.revisionCount}</dd>
                </div>
                <div>
                  <dt>Checks</dt>
                  <dd>{issues?.issueCount ?? 0}</dd>
                </div>
              </dl>
              {analytics.gradeDistribution?.length ? (
                <div className="table-scroll result-summary__grades">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Result</th>
                        <th>Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.gradeDistribution.map((row) => (
                        <tr key={row.resultCode}>
                          <td>{row.resultCode}</td>
                          <td>{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
          {issues?.issues?.length ? (
            <ul className="stack-list">
              {issues.issues.map((issue) => (
                <li key={`${issue.issue}-${issue.entityId}`}>
                  <div className="stack-item">
                    <span>
                      {issue.issue}
                      {issue.registrationNumber ? ` · ${issue.registrationNumber}` : ''}
                      {issue.subjectCode ? ` · ${issue.subjectCode}` : ''}
                    </span>
                    <span>{issue.recommendedAction}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </div>
    </section>
  );
}
