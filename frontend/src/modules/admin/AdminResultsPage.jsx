import { useEffect, useState } from 'react';
import { resultsApi } from '../results/results-api.js';

export function AdminResultsPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const response = await resultsApi.imports();
    setItems(response.data.items);
  }

  async function openPreview(id) {
    setSelectedId(id);
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

  return (
    <section className="admin-page">
      <h1>Official result imports</h1>
      <p>Matching uses registration number and subject code only. Names are shown for review.</p>
      {error ? <p className="form-error">{error}</p> : null}
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
          <input type="file" name="file" accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Uploading…' : 'Upload and parse'}
        </button>
      </form>
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
                  Preview
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview ? (
        <div>
          <h2>Preview</h2>
          <p>
            {preview.import.processingStatus}. Valid {preview.import.summary?.validRows ?? 0}, blocked{' '}
            {preview.import.summary?.blockedRows ?? 0}, updates {preview.import.summary?.updateRows ?? 0}, new{' '}
            {preview.import.summary?.newRows ?? 0}.
          </p>
          {preview.import.duplicateOfImportId ? <p>This file matches a previously committed import checksum.</p> : null}
          <table className="data-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Subject</th>
                <th>Result</th>
                <th>Status</th>
                <th>Action</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {preview.items.map((row) => (
                <tr key={row.id}>
                  <td>{row.registrationNumber}</td>
                  <td>{row.subjectCode}</td>
                  <td>{row.resultCode}</td>
                  <td>{row.rowStatus}</td>
                  <td>{row.proposedAction}</td>
                  <td>{(row.validationErrors || []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.import.processingStatus !== 'COMMITTED' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Commit official results for valid rows in this import?')) {
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
              Commit valid rows
            </button>
          ) : (
            <p>This import is committed.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
