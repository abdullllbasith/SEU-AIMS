import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { lecturerApi } from '../lecturer/lecturer-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import { StatIcon } from '../../ui/stat-icons.jsx';
import {
  formatBatchLabel,
  formatSemesterShortName,
  formatYearLabel,
} from '../../ui/academic-labels.js';

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

  const counts = useMemo(
    () => ({
      all: items.length,
      active: items.filter((item) => item.canManage).length,
      readonly: items.filter((item) => !item.canManage).length,
    }),
    [items],
  );

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

      <nav className="tab-nav" aria-label="Assignment filter">
        <button
          type="button"
          className={filter === 'all' ? 'tab-nav__tab is-active' : 'tab-nav__tab'}
          onClick={() => setFilter('all')}
        >
          All ({counts.all})
        </button>
        <button
          type="button"
          className={filter === 'active' ? 'tab-nav__tab is-active' : 'tab-nav__tab'}
          onClick={() => setFilter('active')}
        >
          Active ({counts.active})
        </button>
        <button
          type="button"
          className={filter === 'readonly' ? 'tab-nav__tab is-active' : 'tab-nav__tab'}
          onClick={() => setFilter('readonly')}
        >
          Read-only ({counts.readonly})
        </button>
      </nav>

      <Panel title="Assignments" kicker={`${visible.length} shown`}>
        {visible.length === 0 ? (
          <EmptyState to="/" action="Back to workspace">
            You have no subject offering assignments in this filter.
          </EmptyState>
        ) : (
          <ul className="assignment-rows">
            {visible.map((item) => (
              <li key={item.id}>
                <Link className="assignment-row" to={item.workspacePath}>
                  <span className="assignment-row__subject">
                    <span className="assignment-row__code">{item.subjectCode}</span>
                    <span className="assignment-row__name">{item.subjectName}</span>
                  </span>
                  <span className="assignment-row__cell assignment-row__cell--batch">
                    <span className="assignment-row__cell-label">Batch</span>
                    <span className="assignment-row__cell-value">
                      {formatBatchLabel({ code: item.batchCode, name: item.batchName }) ||
                        item.batchId ||
                        '—'}
                    </span>
                  </span>
                  <span className="assignment-row__cell assignment-row__cell--year">
                    <span className="assignment-row__cell-label">Year</span>
                    <span className="assignment-row__cell-value">{offeringYearLabel(item)}</span>
                  </span>
                  <span className="assignment-row__cell assignment-row__cell--sem">
                    <span className="assignment-row__cell-label">Semester</span>
                    <span className="assignment-row__cell-value">{offeringSemesterCell(item)}</span>
                  </span>
                  <span className="assignment-row__status">
                    {item.canManage ? (
                      <span className="status-pill status-pill--ok">Active</span>
                    ) : (
                      <span className="status-pill status-pill--muted">Read-only</span>
                    )}
                  </span>
                  <StatIcon name="chevron" className="assignment-row__chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="panel-footnote">
          <Link to="/lecturer/learning">Official resources hub</Link>
          <span className="panel-footnote__sep">·</span>
          <Link to="/lecturer/search">Search assigned content</Link>
        </p>
      </Panel>
    </section>
  );
}
