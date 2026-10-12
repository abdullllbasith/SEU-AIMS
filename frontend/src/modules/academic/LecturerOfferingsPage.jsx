import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { lecturerApi, offeringLabel } from '../lecturer/lecturer-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import {
  formatBatchLabel,
  formatSemesterLabel,
  formatSemesterShortName,
  formatYearLabel,
} from '../../ui/academic-labels.js';

function offeringPeriodMeta(item) {
  const batch = formatBatchLabel({ code: item.batchCode, name: item.batchName }) || item.batchId;
  const semester = formatSemesterLabel(
    { name: item.semesterName, sequence: item.semesterSequence },
    { name: item.academicYearName, sequence: item.academicYearSequence },
  );
  return [batch, semester].filter(Boolean);
}

function offeringYearLabel(item) {
  return (
    formatYearLabel({ name: item.academicYearName, sequence: item.academicYearSequence }) ||
    item.academicYearName ||
    '—'
  );
}

function offeringSemesterCell(item) {
  return (
    formatSemesterShortName(
      { name: item.semesterName, sequence: item.semesterSequence },
      { name: item.academicYearName, sequence: item.academicYearSequence },
    ) ||
    item.semesterName ||
    '—'
  );
}

export function LecturerOfferingsPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    lecturerApi
      .offerings()
      .then((response) => {
        if (!cancelled) {
          setItems(response.data.items);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load assigned offerings');
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

  const visible = useMemo(() => {
    if (filter === 'active') {
      return items.filter((item) => item.canManage);
    }
    if (filter === 'readonly') {
      return items.filter((item) => !item.canManage);
    }
    return items;
  }, [items, filter]);

  if (loading) {
    return <PageSkeleton title="Assigned offerings" variant="list" />;
  }

  if (error) {
    return (
      <section className="record-page">
        <PageHeader title="Assigned offerings" />
        <p className="form-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  return (
    <section className="record-page">
      <PageHeader
        title="Assigned offerings"
        purpose="Names come from Academic Foundation. Inactive assignments are listed as read-only and do not grant management."
      />

      <div className="filter-bar">
        <label>
          Show
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All assignments</option>
            <option value="active">Active (can manage)</option>
            <option value="readonly">Read-only / historical</option>
          </select>
        </label>
      </div>

      <Panel title="Assignments" kicker={`${visible.length} shown`}>
        {visible.length === 0 ? (
          <EmptyState to="/" action="Back to workspace">
            You have no subject offering assignments in this filter.
          </EmptyState>
        ) : (
          <>
            <ul className="entity-list entity-list--compact">
              {visible.map((item) => (
                <li key={item.id}>
                  <Link className="offering-card" to={item.workspacePath}>
                    <p className="offering-card__code">{offeringLabel(item)}</p>
                    <p className="offering-card__meta">
                      {offeringPeriodMeta(item).map((part, index) => (
                        <span key={`${item.id}-meta-${index}`}>
                          {index > 0 ? <span className="panel-footnote__sep">·</span> : null}
                          {part}
                        </span>
                      ))}
                    </p>
                    <p className="offering-card__meta">
                      {item.canManage ? (
                        <span className="status-pill status-pill--ok">Active</span>
                      ) : (
                        <span className="status-pill">Read-only</span>
                      )}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Batch</th>
                    <th>Year</th>
                    <th>Semester</th>
                    <th>Management</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={`row-${item.id}`}>
                      <td>
                        <Link to={item.workspacePath}>{offeringLabel(item)}</Link>
                      </td>
                      <td>
                        {formatBatchLabel({ code: item.batchCode, name: item.batchName }) ||
                          item.batchId ||
                          '—'}
                      </td>
                      <td>{offeringYearLabel(item)}</td>
                      <td>{offeringSemesterCell(item)}</td>
                      <td>{item.canManage ? 'Active' : 'Read-only'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </section>
  );
}
