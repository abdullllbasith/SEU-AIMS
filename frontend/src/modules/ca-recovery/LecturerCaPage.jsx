import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { caApi } from './ca-api.js';
import { RecoveryResultReviews } from './RecoveryResultReviews.jsx';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

export function LecturerCaPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [busyKey, setBusyKey] = useState('');

  async function reload() {
    const [eligible, sched, reviewRes] = await Promise.all([
      caApi.lecturerEligible(),
      caApi.lecturerSchedules(),
      caApi.recoveryResults(),
    ]);
    setItems(eligible.data.items);
    setSchedules(sched.data.items);
    setReviews(reviewRes.data.items || []);
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load CA scheduling');
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

  function runAction(key, fn) {
    setBusyKey(key);
    setError('');
    Promise.resolve()
      .then(fn)
      .then(reload)
      .catch((caught) => setError(caught.message || 'Action failed'))
      .finally(() => setBusyKey(''));
  }

  if (loading) {
    return <PageSkeleton title="CA scheduling" variant="list" />;
  }

  return (
    <section className="record-page">
      <PageHeader
        title="CA scheduling"
        purpose="Schedule approved CA applications for your offerings, and review imported CA recovery grades before they replace E(CA)."
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <RecoveryResultReviews
        items={reviews}
        pending={busyKey}
        onDecide={(id, decision) => runAction(`${decision}:${id}`, () => caApi.decideRecovery(id, decision))}
      />

      <Panel title="Eligible to schedule" kicker={`${items.length} student${items.length === 1 ? '' : 's'}`}>
        {items.length === 0 ? (
          <EmptyState to="/lecturer/offerings" action="View assignments">
            No approved CA students in your assigned offerings.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Registration</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const key = `${item.applicationId}-${item.incompleteCaId}`;
                  return (
                    <tr key={key}>
                      <td>{item.applicationId}</td>
                      <td>
                        <span className="result-subject">{item.registrationNumber}</span>
                      </td>
                      <td>
                        <span className="status-pill">{item.workflowStatus}</span>
                      </td>
                      <td>
                        <div className="stack-item__actions">
                          <ActionButton
                            busy={busyKey === `schedule:${key}`}
                            busyLabel="Scheduling…"
                            disabled={Boolean(busyKey)}
                            onClick={() => {
                              const when = window.prompt(
                                'Schedule start (ISO datetime)',
                                new Date().toISOString(),
                              );
                              if (!when) {
                                return;
                              }
                              runAction(`schedule:${key}`, () =>
                                caApi.createSchedule({
                                  applicationId: item.applicationId,
                                  incompleteCaId: item.incompleteCaId,
                                  subjectOfferingId: item.subjectOfferingId,
                                  scheduledAt: when,
                                  venue: 'Department',
                                }),
                              );
                            }}
                          >
                            Schedule
                          </ActionButton>
                          {item.workflowStatus === 'SCHEDULED' ||
                          item.workflowStatus === 'APPROVED' ? (
                            <ActionButton
                              busy={busyKey === `complete:${key}`}
                              busyLabel="Saving…"
                              disabled={Boolean(busyKey)}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    'Mark this CA recovery as completed? This does not change the official result.',
                                  )
                                ) {
                                  return;
                                }
                                runAction(`complete:${key}`, () => caApi.complete(item.applicationId));
                              }}
                            >
                              Mark completed
                            </ActionButton>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="panel-footnote">
          <Link to="/">Teaching workspace</Link>
        </p>
      </Panel>

      <Panel title="Existing schedules" kicker={`${schedules.length} total`}>
        {schedules.length === 0 ? (
          <p className="deadline-empty">No schedules created yet.</p>
        ) : (
          <ul className="stack-list">
            {schedules.map((item) => (
              <li key={item.id}>
                <div className="stack-item">
                  <span>
                    <span className="stack-item__title">
                      {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : item.scheduledAt}
                    </span>
                    <span className="stack-item__meta">
                      {item.venue || 'Venue not set'}
                      {item.cancelledAt ? ' · cancelled' : ''}
                    </span>
                  </span>
                  <span className="stack-item__actions">
                    {!item.cancelledAt ? (
                      <ActionButton
                        busy={busyKey === `cancel:${item.id}`}
                        busyLabel="Cancelling…"
                        disabled={Boolean(busyKey)}
                        onClick={() => {
                          if (!window.confirm('Cancel this CA schedule?')) {
                            return;
                          }
                          runAction(`cancel:${item.id}`, () => caApi.cancelSchedule(item.id));
                        }}
                      >
                        Cancel
                      </ActionButton>
                    ) : (
                      <span className="status-pill status-pill--danger">Cancelled</span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
