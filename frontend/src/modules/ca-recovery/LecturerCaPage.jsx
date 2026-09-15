import { useEffect, useState } from 'react';
import { caApi } from '../ca-recovery/ca-api.js';

export function LecturerCaPage() {
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [schedules, setSchedules] = useState([]);

  async function reload() {
    const [eligible, sched] = await Promise.all([caApi.lecturerEligible(), caApi.lecturerSchedules()]);
    setItems(eligible.data.items);
    setSchedules(sched.data.items);
  }

  useEffect(() => {
    reload().catch((caught) => setError(caught.message || 'Unable to load CA scheduling'));
  }, []);

  return (
    <section>
      <h1>CA scheduling</h1>
      {error ? <p className="form-error">{error}</p> : null}
      <p>Only approved students for offerings assigned to you are listed. Official grades are not shown.</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Application</th>
            <th>Registration</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.applicationId}-${item.incompleteCaId}`}>
              <td>{item.applicationId}</td>
              <td>{item.registrationNumber}</td>
              <td>{item.workflowStatus}</td>
              <td>
                <button
                  type="button"
                  onClick={() => {
                    const when = window.prompt('Schedule start (ISO datetime)', new Date().toISOString());
                    if (!when) {
                      return;
                    }
                    caApi
                      .createSchedule({
                        applicationId: item.applicationId,
                        incompleteCaId: item.incompleteCaId,
                        subjectOfferingId: item.subjectOfferingId,
                        scheduledAt: when,
                        venue: 'Department',
                      })
                      .then(reload)
                      .catch((caught) => setError(caught.message));
                  }}
                >
                  Schedule
                </button>
                {item.workflowStatus === 'SCHEDULED' || item.workflowStatus === 'APPROVED' ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm('Mark this CA recovery as completed? This does not change the official result.')) {
                        return;
                      }
                      caApi.complete(item.applicationId).then(reload).catch((caught) => setError(caught.message));
                    }}
                  >
                    Mark completed
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Existing schedules</h2>
      <ul>
        {schedules.map((item) => (
          <li key={item.id}>
            {item.scheduledAt} {item.venue} {item.cancelledAt ? '(cancelled)' : ''}
            {!item.cancelledAt ? (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm('Cancel this CA schedule?')) {
                    return;
                  }
                  caApi.cancelSchedule(item.id).then(reload).catch((caught) => setError(caught.message));
                }}
              >
                Cancel
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
