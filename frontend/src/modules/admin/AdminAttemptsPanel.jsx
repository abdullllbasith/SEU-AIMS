import { useCallback, useEffect, useState } from 'react';
import { assessmentApi } from '../ca-recovery/assessment-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { Panel } from '../../ui/Panel.jsx';

const STAGE_LABEL = {
  DRAFT: 'Draft',
  RETURNED: 'Returned',
  SUBMITTED: 'Submitted',
  VERIFIED: 'Verified',
  BOARD_AUTHORIZED: 'Board authorized',
  PUBLISHED: 'Published',
  VOIDED: 'Voided',
};

/** Verify, record the Board reference and publish. Renders nothing while the feature is off on the server. */
export function AdminAttemptsPanel() {
  const [attempts, setAttempts] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await assessmentApi.adminAttempts();
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

  const field = (id, name) => form[`${id}:${name}`] ?? '';
  const setField = (id, name, value) => setForm({ ...form, [`${id}:${name}`]: value });

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

  const open = attempts.filter((a) => !['PUBLISHED', 'VOIDED'].includes(a.stage));

  return (
    <Panel title="CA recovery marks" kicker={`${open.length} open`}>
      <p>
        Verify the lecturer's CA mark with the ESA mark from the Examination unit sheet, record the Board reference, then
        publish. A grade above C replacing E(CA) also needs a recorded Board cap decision.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {attempts.length === 0 ? (
        <EmptyState>No CA recovery marks have been submitted.</EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Status</th>
                <th>CA</th>
                <th>ESA</th>
                <th>Proposed</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td>{a.registrationNumber}</td>
                  <td>{STAGE_LABEL[a.stage] || a.stage}</td>
                  <td>{a.caMark ?? '—'}</td>
                  <td>
                    {a.stage === 'SUBMITTED' ? (
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        aria-label={`ESA mark for ${a.registrationNumber}`}
                        value={field(a.id, 'esa')}
                        onChange={(event) => setField(a.id, 'esa', event.target.value)}
                      />
                    ) : (
                      a.esaMark ?? '—'
                    )}
                  </td>
                  <td>{a.publishedResultCode || a.proposedResultCode || '—'}</td>
                  <td>
                    {a.stage === 'SUBMITTED' ? (
                      <>
                        <ActionButton
                          busy={busy === `verify:${a.id}`}
                          busyLabel="Verifying…"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            run(`verify:${a.id}`, () =>
                              assessmentApi.verify(a.id, field(a.id, 'esa') === '' ? '' : Number(field(a.id, 'esa'))),
                            )
                          }
                        >
                          Verify
                        </ActionButton>
                        <input
                          placeholder="Return reason"
                          aria-label={`Return reason for ${a.registrationNumber}`}
                          value={field(a.id, 'reason')}
                          onChange={(event) => setField(a.id, 'reason', event.target.value)}
                        />
                        <ActionButton
                          busy={busy === `return:${a.id}`}
                          busyLabel="Returning…"
                          disabled={Boolean(busy) || !field(a.id, 'reason').trim()}
                          onClick={() => run(`return:${a.id}`, () => assessmentApi.returnAttempt(a.id, field(a.id, 'reason')))}
                        >
                          Return
                        </ActionButton>
                      </>
                    ) : null}
                    {a.stage === 'VERIFIED' ? (
                      <>
                        <input
                          placeholder="Board reference"
                          aria-label={`Board reference for ${a.registrationNumber}`}
                          value={field(a.id, 'ref')}
                          onChange={(event) => setField(a.id, 'ref', event.target.value)}
                        />
                        <input
                          type="date"
                          aria-label={`Board meeting date for ${a.registrationNumber}`}
                          value={field(a.id, 'date')}
                          onChange={(event) => setField(a.id, 'date', event.target.value)}
                        />
                        <ActionButton
                          busy={busy === `board:${a.id}`}
                          busyLabel="Recording…"
                          disabled={Boolean(busy) || !field(a.id, 'ref').trim() || !field(a.id, 'date')}
                          onClick={() =>
                            run(`board:${a.id}`, () =>
                              assessmentApi.recordBoard(a.id, {
                                scope: 'GRADE_PUBLICATION',
                                reference: field(a.id, 'ref').trim(),
                                meetingDate: field(a.id, 'date'),
                              }),
                            )
                          }
                        >
                          Record Board reference
                        </ActionButton>
                      </>
                    ) : null}
                    {a.stage === 'BOARD_AUTHORIZED' ? (
                      <>
                        <ActionButton
                          busy={busy === `publish:${a.id}`}
                          busyLabel="Publishing…"
                          disabled={Boolean(busy)}
                          onClick={() => run(`publish:${a.id}`, () => assessmentApi.publish(a.id))}
                        >
                          Publish {a.proposedResultCode}
                        </ActionButton>
                        <input
                          placeholder="Cap decision reference"
                          aria-label={`Cap decision reference for ${a.registrationNumber}`}
                          value={field(a.id, 'capRef')}
                          onChange={(event) => setField(a.id, 'capRef', event.target.value)}
                        />
                        <input
                          placeholder="Reason"
                          aria-label={`Cap decision reason for ${a.registrationNumber}`}
                          value={field(a.id, 'capReason')}
                          onChange={(event) => setField(a.id, 'capReason', event.target.value)}
                        />
                        <input
                          type="date"
                          aria-label={`Cap decision date for ${a.registrationNumber}`}
                          value={field(a.id, 'capDate')}
                          onChange={(event) => setField(a.id, 'capDate', event.target.value)}
                        />
                        <ActionButton
                          busy={busy === `cap:${a.id}`}
                          busyLabel="Recording…"
                          disabled={
                            Boolean(busy) ||
                            !field(a.id, 'capRef').trim() ||
                            !field(a.id, 'capReason').trim() ||
                            !field(a.id, 'capDate')
                          }
                          onClick={() =>
                            run(`cap:${a.id}`, () =>
                              assessmentApi.recordBoard(a.id, {
                                scope: 'CAP_DECISION',
                                reference: field(a.id, 'capRef').trim(),
                                meetingDate: field(a.id, 'capDate'),
                                authorizedResultCode: a.proposedResultCode,
                                decisionText: field(a.id, 'capReason').trim(),
                              }),
                            )
                          }
                        >
                          Record cap decision for {a.proposedResultCode}
                        </ActionButton>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
