import { useEffect, useState } from 'react';
import { gpaApi, resultsApi } from '../results/results-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';

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

  async function reload() {
    const response = await resultsApi.imports();
    setItems(response.data.items);
  }

  async function openPreview(id) {
    setSelectedId(id);
    setVersions(null);
    const response = await resultsApi.preview(id, { pageSize: 50 });
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
    return <p>Loading result imports…</p>;
  }

  const status = preview?.import?.processingStatus;
  const canCommit = status && !['COMMITTED', 'COMMITTING', 'CANCELLED', 'REJECTED_FILE'].includes(status);
  const canReject = status && !['COMMITTED', 'COMMITTING', 'CANCELLED'].includes(status);
  const canReprocess = status && !['COMMITTED', 'COMMITTING'].includes(status);

  return (
    <section className="admin-page">
      <PageHeader
        title="Official result imports"
        purpose="Upload a department result file, review registration number and subject code matches, then commit only new or updated official rows."
      />
      {error ? <p className="form-error">{error}</p> : null}
      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const file = event.target.file.files[0];
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
                return reload().then(() => openPreview(response.data.id));
              })
              .catch((caught) => setError(caught.message || 'Import failed'))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Result file (PDF or XLSX)
            <input
              type="file"
              name="file"
              accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload and parse'}
          </button>
        </form>
      </Panel>
      {items.length === 0 ? <p>No imports yet.</p> : null}
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
            <tr key={item.id}>
              <td>{item.processingStatus}</td>
              <td>{item.sourceType}</td>
              <td>{item.summary?.totalRows ?? 0}</td>
              <td>{item.summary?.unmatchedRows ?? 0}</td>
              <td>{item.summary?.ecaRows ?? 0}</td>
              <td>
                <button type="button" onClick={() => openPreview(item.id).catch((caught) => setError(caught.message))}>
                  Review
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview ? (
        <Panel>
          <h2>Review</h2>
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
          {preview.import.failureCode ? <p>Failure: {preview.import.failureCode}</p> : null}
          <table className="data-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Subject</th>
                <th>Result</th>
                <th>Source</th>
                <th>Status</th>
                <th>Action</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {preview.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.registrationNumber}</td>
                  <td>{row.subjectCode}</td>
                  <td>{row.resultCode}</td>
                  <td>{row.sourceLocation || '—'}</td>
                  <td>{row.rowStatus}</td>
                  <td>{row.proposedAction}</td>
                  <td>{(row.validationErrors || []).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                    .catch((caught) => setError(caught.message || 'Commit failed'))
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
      <Panel>
        <h2>Official records</h2>
        <form
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
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
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
