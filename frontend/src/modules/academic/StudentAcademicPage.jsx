import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { academicApi } from '../admin/academic-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import {
  formatBatchLabel,
  formatSemesterLabel,
  formatSubjectLabel,
  formatYearLabel,
} from '../../ui/academic-labels.js';

export function StudentAcademicPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState(null);
  const [offerings, setOfferings] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [contextRes, offeringRes] = await Promise.all([
          academicApi.myContext(),
          academicApi.myOfferings(),
        ]);
        if (!cancelled) {
          setPayload(contextRes.data);
          setOfferings(offeringRes.data.items || []);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught.message || 'Unable to load academic context');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <PageSkeleton title="My academic context" variant="record" />;
  }

  if (error) {
    return (
      <section className="record-page">
        <PageHeader title="My academic context" />
        <p className="form-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  const context = payload?.context;
  const history = payload?.history || [];
  const currentYear = context
    ? {
        name: context.currentAcademicYearName,
        sequence: context.currentAcademicYearSequence,
      }
    : null;
  const currentSemester = context
    ? {
        name: context.currentSemesterName,
        sequence: context.currentSemesterSequence,
      }
    : null;

  return (
    <section className="record-page">
      <PageHeader
        title="My academic context"
        purpose="Registration number and current progression."
      />

      <Panel title="Membership record" kicker={context?.registrationNumber || 'Academic identity'}>
        {!context ? (
          <EmptyState to="/profile" action="Open profile">
            No academic membership is recorded yet.
          </EmptyState>
        ) : (
          <>
            <dl className="record-dl record-dl--row">
              <div>
                <dt>Registration number</dt>
                <dd>{context.registrationNumber}</dd>
              </div>
              <div>
                <dt>Batch</dt>
                <dd>
                  {formatBatchLabel({ code: context.batchCode, name: context.batchName }) || '—'}
                </dd>
              </div>
              <div>
                <dt>Current academic year</dt>
                <dd>{formatYearLabel(currentYear) || '—'}</dd>
              </div>
              <div>
                <dt>Current semester</dt>
                <dd>{formatSemesterLabel(currentSemester, currentYear) || '—'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <span className="status-pill status-pill--ok">{context.status}</span>
                </dd>
              </div>
            </dl>

            <div className="academic-stepper" aria-label="Academic year progression">
              {[1, 2, 3, 4].map((yearNum) => {
                const currentSeq = Number(context.currentAcademicYearSequence) || 0;
                const stateClass =
                  yearNum < currentSeq
                    ? 'academic-step is-completed'
                    : yearNum === currentSeq
                      ? 'academic-step is-current'
                      : 'academic-step';
                return (
                  <div key={yearNum} className={stateClass}>
                    <span className="academic-step__badge">{yearNum}</span>
                    <div className="academic-step__copy">
                      <span className="academic-step__title">Year {yearNum}</span>
                      <span className="academic-step__meta">
                        {yearNum < currentSeq
                          ? 'Completed'
                          : yearNum === currentSeq
                            ? formatSemesterLabel(currentSemester, currentYear) || 'In progress'
                            : 'Upcoming'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Panel>

      <Panel title="Current offerings" kicker={`${offerings.length} active`}>
        {offerings.length === 0 ? (
          <p className="deadline-empty">No active offerings for your current semester.</p>
        ) : (
          <ul className="entity-list">
            {offerings.map((item) => (
              <li key={item.id}>
                <Link className="offering-card" to={`/learning/offerings/${item.id}`}>
                  <p className="offering-card__code">{formatSubjectLabel(item)}</p>
                  <p className="offering-card__meta">
                    {formatSemesterLabel(currentSemester, currentYear) || 'Current semester offering'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="panel-footnote">
          <Link to="/learning">Official learning resources</Link>
          <span className="panel-footnote__sep">·</span>
          <Link to="/academic/history">Academic history</Link>
        </p>
      </Panel>

      <Panel title="Progression history" kicker={`${history.length} record${history.length === 1 ? '' : 's'}`}>
        {history.length === 0 ? (
          <p className="deadline-empty">No recorded academic history yet.</p>
        ) : (
          <ul className="progression-rows" aria-label="Semesters recorded in your membership">
            {history.map((item) => {
              const year = {
                name: item.academicYearName,
                sequence: item.academicYearSequence,
              };
              const semester = {
                name: item.semesterName,
                sequence: item.semesterSequence,
              };
              return (
                <li key={item.id} className="progression-row">
                  <span className="progression-row__year">{formatYearLabel(year) || 'Academic year'}</span>
                  <span className="progression-row__arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="progression-row__sem">
                    {formatSemesterLabel(semester, year) || 'Semester'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </section>
  );
}
