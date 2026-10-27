import { useState } from 'react';
import { academicApi } from './academic-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { Panel } from '../../ui/Panel.jsx';

const BLOCKED_COPY = {
  EXISTING_UNSPECIALIZED_MAPPING: {
    title: 'Already mapped with no specialization',
    detail:
      'These subjects already belong to that year and semester as common subjects. The catalog lists them separately for SWT and NST, and this import does not replace the existing mapping.',
  },
  EXISTING_SPECIALIZED_MAPPING: {
    title: 'Already mapped to a specialization',
    detail:
      'A SWT or NST mapping already exists for this period. The catalog’s common row was left unchanged.',
  },
  AMBIGUOUS_SPECIALIZATION: {
    title: 'Specialization could not be chosen',
    detail: 'The catalog did not give one specialization for these rows, so they were left unchanged.',
  },
};

function groupBlocked(items) {
  const byReason = new Map();
  for (const item of items || []) {
    const reason = item.reason || 'BLOCKED';
    if (!byReason.has(reason)) {
      byReason.set(reason, new Map());
    }
    const key = `${item.code}|${item.year}|${item.semester}`;
    const rows = byReason.get(reason);
    if (!rows.has(key)) {
      rows.set(key, { code: item.code, year: item.year, semester: item.semester, specializations: [] });
    }
    const label = item.specialization || 'Common';
    const row = rows.get(key);
    if (!row.specializations.includes(label)) {
      row.specializations.push(label);
    }
  }
  return [...byReason.entries()].map(([reason, rows]) => ({ reason, rows: [...rows.values()] }));
}

export function CatalogImportPanel() {
  const [report, setReport] = useState(null);
  const [reportKind, setReportKind] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const busy = Boolean(pending);

  function run(key, fn) {
    setPending(key);
    setError('');
    return Promise.resolve()
      .then(fn)
      .then((response) => {
        setReport(response.data);
        setReportKind(key);
        return response;
      })
      .catch((caught) => {
        setError(caught.message || 'Catalog import failed');
      })
      .finally(() => setPending(''));
  }

  return (
    <Panel title="DICT curriculum import" kicker="Preview before insert">
        <p className="panel-lead">
          Loads the vendored DICT subject, credit, year, semester, and specialization catalog into this department.
          Years 1 and 2 stay common. Years 3 and 4 are stored as SWT or NST. Batch offerings are not created.
        </p>
      <div className="panel-actions">
        <ActionButton busy={pending === 'preview'} busyLabel="Previewing…" disabled={busy} onClick={() => run('preview', () => academicApi.catalogPreview())}>
          Preview catalog
        </ActionButton>
        <ActionButton
          busy={pending === 'import'}
          busyLabel="Importing…"
          disabled={busy || !report}
          onClick={() => {
            if (!window.confirm('Import the catalog subjects and curriculum mappings for this department?')) {
              return;
            }
            run('import', () => academicApi.catalogCommit());
          }}
        >
          Import catalog
        </ActionButton>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {report ? (
        <div className="panel-subsection catalog-preview">
          <dl className="catalog-preview__stats">
            <div>
              <dt>Subjects to add</dt>
              <dd>{report.subjects.create}</dd>
            </div>
            <div>
              <dt>Subjects already present</dt>
              <dd>{report.subjects.unchanged}</dd>
            </div>
            <div>
              <dt>Mappings to add</dt>
              <dd>{report.mappings.create}</dd>
            </div>
            <div>
              <dt>Mappings already present</dt>
              <dd>{report.mappings.unchanged}</dd>
            </div>
            <div>
              <dt>Mappings left unchanged</dt>
              <dd>{report.mappings.blocked}</dd>
            </div>
            <div>
              <dt>Offerings created</dt>
              <dd>{report.offeringsCreated}</dd>
            </div>
          </dl>
          {report.unstored?.note ? <p className="panel-lead">{report.unstored.note}</p> : null}
          {reportKind === 'import' ? (
            <p className="panel-lead">
              {report.summary?.subjectsCreated || report.summary?.mappingsCreated
                ? `Imported ${report.summary.subjectsCreated} subjects and ${report.summary.mappingsCreated} mappings.`
                : 'Nothing new was written. Subjects and mappings that already match the catalog were left as they are. Year 3 and Year 4 rows stay unchanged while a common mapping exists for that subject and period.'}
            </p>
          ) : null}
          {groupBlocked(report.ambiguousMappings).map((group) => {
            const copy = BLOCKED_COPY[group.reason] || {
              title: 'Left unchanged',
              detail: 'These catalog rows were not written.',
            };
            return (
              <section key={group.reason} className="catalog-preview__group">
                <h3>{copy.title}</h3>
                <p>{copy.detail}</p>
                <p className="catalog-preview__count">{group.rows.length} subjects</p>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Period</th>
                        <th>Catalog lists</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={`${row.code}-${row.year}-${row.semester}`}>
                          <td className="keep">{row.code}</td>
                          <td className="keep">Year {row.year} · Semester {row.semester}</td>
                          <td className="keep">{row.specializations.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          {report.conflicts?.length ? (
            <section className="catalog-preview__group">
              <h3>Catalog names disagree</h3>
              <ul className="stack-list">
                {report.conflicts.map((item) => (
                  <li key={item.code} className="stack-item">
                    <span className="stack-item__title">{item.code}</span>
                    <span className="stack-item__meta">{item.names.join(' / ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {report.databaseConflicts?.length ? (
            <section className="catalog-preview__group">
              <h3>Existing subjects were kept</h3>
              <ul className="stack-list">
                {report.databaseConflicts.map((item) => (
                  <li key={item.code} className="stack-item">
                    <span className="stack-item__title">{item.code}</span>
                    <span className="stack-item__meta">Left unchanged. {item.reasons.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
