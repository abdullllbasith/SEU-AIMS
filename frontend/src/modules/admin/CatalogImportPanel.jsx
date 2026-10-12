import { useState } from 'react';
import { academicApi } from './academic-api.js';
import { Panel } from '../../ui/Panel.jsx';

function countLine(label, value) {
  return `${label}: ${value}`;
}

export function CatalogImportPanel() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function run(fn) {
    setBusy(true);
    setError('');
    return Promise.resolve()
      .then(fn)
      .then((response) => {
        setReport(response.data);
        return response;
      })
      .catch((caught) => {
        setError(caught.message || 'Catalog import failed');
      })
      .finally(() => setBusy(false));
  }

  return (
    <Panel title="DICT curriculum import" kicker="Preview before insert">
        <p className="panel-lead">
          Loads the vendored DICT subject, credit, year, semester, and specialization catalog into this department.
          Years 1 and 2 stay common. Years 3 and 4 are stored as SWT or NST. Batch offerings are not created.
        </p>
      <div className="panel-actions">
        <button type="button" disabled={busy} onClick={() => run(() => academicApi.catalogPreview())}>
          Preview catalog
        </button>
        <button
          type="button"
          disabled={busy || !report}
          onClick={() => {
            if (!window.confirm('Import the catalog subjects and curriculum mappings for this department?')) {
              return;
            }
            run(() => academicApi.catalogCommit());
          }}
        >
          Import catalog
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {report ? (
        <div className="panel-subsection">
          <p>{countLine('Subjects to add', report.subjects.create)}</p>
          <p>{countLine('Subjects already present', report.subjects.unchanged)}</p>
          <p>{countLine('Mappings to add', report.mappings.create)}</p>
          <p>{countLine('Mappings already present', report.mappings.unchanged)}</p>
          <p>{countLine('Mappings blocked', report.mappings.blocked)}</p>
          <p>{countLine('Offerings created', report.offeringsCreated)}</p>
          <p>{report.unstored?.note}</p>
          {report.conflicts?.length ? (
            <ul className="stack-list">
              {report.conflicts.map((item) => (
                <li key={item.code}>
                  {item.code} was not imported: {item.reasons.join(', ')}. Names in the catalog: {item.names.join(' / ')}
                </li>
              ))}
            </ul>
          ) : null}
          {report.ambiguousMappings?.length ? (
            <ul className="stack-list">
              {report.ambiguousMappings.map((item) => (
                <li key={`${item.code}-${item.year}-${item.semester}-${item.specialization || 'common'}`}>
                  {item.code} Year {item.year} Semester {item.semester} {item.specialization || 'common'} was not
                  changed: {item.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {report.databaseConflicts?.length ? (
            <ul className="stack-list">
              {report.databaseConflicts.map((item) => (
                <li key={item.code}>
                  {item.code} conflicts with the existing subject ({item.reasons.join(', ')}) and was left unchanged.
                </li>
              ))}
            </ul>
          ) : null}
          {report.summary?.subjectsCreated ? (
            <p>
              Imported {report.summary.subjectsCreated} subjects and {report.summary.mappingsCreated} mappings.
            </p>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
