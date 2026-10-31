import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { caApi } from '../ca-recovery/ca-api.js';
import { CaExamForm } from '../ca-recovery/CaExamForm.jsx';
import { CaQrScanner } from './CaQrScanner.jsx';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { OperationNotice } from '../../ui/OperationNotice.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import { formatWorkflowStatus } from '../../ui/status-labels.js';

const PHYSICAL_LABEL = {
  NOT_STARTED: 'Not started',
  AWAITING_PHYSICAL: 'Awaiting physical copy',
  PHYSICALLY_VERIFIED: 'Verified',
  VERIFICATION_FAILED: 'Failed',
};

function queueActions(item) {
  const status = item.workflowStatus;
  const physical = item.physicalVerificationStatus;
  return {
    verify: ['SUBMITTED', 'UNDER_VERIFICATION'].includes(status) && physical !== 'PHYSICALLY_VERIFIED',
    approve: status === 'UNDER_VERIFICATION' && physical === 'PHYSICALLY_VERIFIED',
    reject: ['DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION'].includes(status),
    reopen: ['REJECTED', 'SUBMITTED'].includes(status),
  };
}

export function AdminCaReview({ applicationId }) {
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState('');
  const [reason, setReason] = useState('');
  const busy = Boolean(pending);

  function load() {
    return caApi.get(applicationId).then((response) => {
      setApplication(response.data);
      return response.data;
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    load()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'The application form could not be opened.');
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
  }, [applicationId]);

  function run(key, action, success) {
    setPending(key);
    setNotice(null);
    Promise.resolve()
      .then(action)
      .then(() => load())
      .then(() => setNotice({ tone: 'success', message: success }))
      .catch((caught) => setNotice({ tone: 'failure', message: caught.message || 'The action could not be completed.' }))
      .finally(() => setPending(''));
  }

  if (loading) {
    return <PageSkeleton title="Application form" variant="record" />;
  }

  if (!application) {
    return (
      <section className="admin-page record-page">
        <PageHeader title="Application form" purpose="The requested CA application could not be opened." />
        <p className="form-error" role="alert">
          {error || 'Application not found.'}
        </p>
        <p className="ca-review__back">
          <Link to="/admin/ca">Back to queue</Link>
        </p>
      </section>
    );
  }

  const actions = queueActions(application);

  return (
    <section className="admin-page record-page">
      <PageHeader
        title={application.applicationId}
        purpose={`${application.registrationNumber}. Compare the paper in hand with this form before deciding.`}
        meta={`${formatWorkflowStatus(application.workflowStatus)} · ${PHYSICAL_LABEL[application.physicalVerificationStatus] || application.physicalVerificationStatus}`}
      />
      <p className="ca-review__back">
        <Link to="/admin/ca">Back to queue</Link>
      </p>
      <div className="ca-review">
        <Panel title="Application form" kicker={application.registrationNumber}>
          <p className="panel-lead">Faculty of Technology is the only faculty on this form.</p>
          {application.form ? (
            <CaExamForm form={application.form} qrDataUrl={application.qrDataUrl} applicationId={application.applicationId} readOnly />
          ) : (
            <p className="deadline-empty">This application has no stored form yet.</p>
          )}
          <div className="panel-actions">
            <ActionButton
              busy={pending === 'pdf'}
              busyLabel="Downloading…"
              disabled={busy}
              onClick={() => {
                setPending('pdf');
                caApi
                  .download(application.applicationId)
                  .then(() => setNotice({ tone: 'success', message: 'Form downloaded.' }))
                  .catch((caught) => setNotice({ tone: 'failure', message: caught.message || 'The form could not be downloaded.' }))
                  .finally(() => setPending(''));
              }}
            >
              Download form
            </ActionButton>
          </div>
        </Panel>

        <Panel title="Decision" kicker="This application">
          {application.workflowStatus === 'DRAFT' ? (
            <p className="panel-lead">Still a draft. Physical verification starts after the student submits it.</p>
          ) : null}
          {actions.verify ? (
            <CaQrScanner
              busy={busy}
              hint={`Scan the QR code on the printed form, or type ${application.applicationId}. It must match this application. Verifying does not approve it.`}
              onSubmit={async (receipt) => {
                await caApi.verify(application.applicationId, { outcome: 'verified', receipt, inspectionConfirmed: true });
                await load();
                setNotice({
                  tone: 'success',
                  message: `${application.applicationId} is physically verified. Approve or reject it separately.`,
                });
              }}
            />
          ) : null}
          {application.physicalVerificationStatus === 'PHYSICALLY_VERIFIED' ? (
            <p className="receipt-check__status" role="status">
              The physical copy for {application.applicationId} is already verified.
            </p>
          ) : null}
          {actions.reject || actions.reopen ? (
            <label>
              Reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          ) : null}
          <div className="receipt-check__actions">
            {actions.approve ? (
              <ActionButton
                className="btn--primary"
                busy={pending === 'approve'}
                busyLabel="Approving…"
                disabled={busy}
                onClick={() =>
                  run('approve', () => caApi.approve(application.applicationId), `${application.applicationId} approved.`)
                }
              >
                Approve
              </ActionButton>
            ) : null}
            {actions.reject ? (
              <ActionButton
                className="btn--danger"
                busy={pending === 'reject'}
                busyLabel="Rejecting…"
                disabled={busy}
                onClick={() => {
                  if (!reason.trim()) {
                    setNotice({ tone: 'failure', message: 'Enter a reason before rejecting this application.' });
                    return;
                  }
                  run(
                    'reject',
                    () => caApi.reject(application.applicationId, { reason: reason.trim() }),
                    `${application.applicationId} rejected.`,
                  );
                }}
              >
                Reject
              </ActionButton>
            ) : null}
            {actions.reopen ? (
              <ActionButton
                busy={pending === 'reopen'}
                busyLabel="Reopening…"
                disabled={busy}
                onClick={() => {
                  if (!reason.trim()) {
                    setNotice({ tone: 'failure', message: 'Enter a reason before reopening this application.' });
                    return;
                  }
                  run(
                    'reopen',
                    () => caApi.reopen(application.applicationId, { reason: reason.trim() }),
                    `${application.applicationId} reopened as a draft.`,
                  );
                }}
              >
                Reopen
              </ActionButton>
            ) : null}
          </div>
          <OperationNotice notice={notice} />
        </Panel>
      </div>
    </section>
  );
}
