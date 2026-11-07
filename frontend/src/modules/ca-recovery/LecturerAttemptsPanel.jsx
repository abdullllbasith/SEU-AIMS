import { useCallback, useEffect, useState } from 'react';
import { assessmentApi } from './assessment-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { Panel } from '../../ui/Panel.jsx';

const STAGE_LABEL = {
  DRAFT: 'Draft',
  RETURNED: 'Returned',
  SUBMITTED: 'Waiting for verification',
  VERIFIED: 'Verified',
  BOARD_AUTHORIZED: 'Board authorized',
  PUBLISHED: 'Published',
  VOIDED: 'Voided',
};

/**
 * Lecturer enters the CA mark for a recovery sitting. ESA marks come from the Examination unit and are
 * entered by the administrator. Renders nothing while the feature is off on the server.
 */
export function LecturerAttemptsPanel({ items = [] }) {
  const [attempts, setAttempts] = useState(null);
  const [marks, setMarks] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await assessmentApi.lecturerAttempts();
      setAttempts(response.data);
    } catch {
      setAttempts(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!attempts) {
    return null;
  }

  const hasAttempt = new Set(attempts.filter((a) => a.stage !== 'VOIDED').map((a) => a.linkId));
  const openable = items.filter((item) => item.examStatus === 'COMPLETED' && item.attended === true && !hasAttempt.has(item.linkId));

  async function run(key, action) {
    setBusy(key);
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message || 'The action failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <Panel title="CA recovery marks" kicker={`${attempts.length} sittings`}>
      <p>Enter the CA mark (0 to 100) for students who attended. The administrator adds the ESA mark and publishes.</p>
      {error ? <p role="alert">{error}</p> : null}
      {openable.length ? (
        <ul>
          {openable.map((item) => (
            <li key={item.linkId}>
              {item.registrationNumber} · {item.subjectCode}{' '}
              <ActionButton
                busy={busy === `open:${item.linkId}`}
                busyLabel="Opening…"
                disabled={Boolean(busy)}
                onClick={() => run(`open:${item.linkId}`, () => assessmentApi.openAttempt(item.linkId))}
              >
                Open marks entry
              </ActionButton>
            </li>
          ))}
        </ul>
      ) : null}
      {attempts.length === 0 ? (
        <EmptyState>No marks entry has been opened yet.</EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Sitting</th>
                <th>Status</th>
                <th>CA mark</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => {
                const editable = ['DRAFT', 'RETURNED'].includes(attempt.stage);
                const value = marks[attempt.id] ?? (attempt.caMark ?? '');
                return (
                  <tr key={attempt.id}>
                    <td>{attempt.registrationNumber}</td>
                    <td>
                      {attempt.opportunityNumber} ({attempt.candidateStatus === 'FRESH' ? 'fresh' : 'repeat'})
                    </td>
                    <td>
                      {STAGE_LABEL[attempt.stage] || attempt.stage}
                      {attempt.returnReason ? ` — ${attempt.returnReason}` : ''}
                    </td>
                    <td>
                      {editable ? (
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          aria-label={`CA mark for ${attempt.registrationNumber}`}
                          value={value}
                          onChange={(event) => setMarks({ ...marks, [attempt.id]: event.target.value })}
                        />
                      ) : (
                        attempt.caMark ?? '—'
                      )}
                    </td>
                    <td>
                      {editable ? (
                        <ActionButton
                          busy={busy === `submit:${attempt.id}`}
                          busyLabel="Submitting…"
                          disabled={Boolean(busy) || value === ''}
                          onClick={() =>
                            run(`submit:${attempt.id}`, async () => {
                              await assessmentApi.saveMarks(attempt.id, Number(value));
                              await assessmentApi.submit(attempt.id);
                            })
                          }
                        >
                          Save and submit
                        </ActionButton>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
