import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { caApi } from '../ca-recovery/ca-api.js';
import { CaExamForm } from '../ca-recovery/CaExamForm.jsx';
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

function ReceiptCheck({ applicationId, busy, matched, onMatch, onClear }) {
  const videoRef = useRef(null);
  const onMatchRef = useRef(onMatch);
  const onClearRef = useRef(onClear);
  onMatchRef.current = onMatch;
  onClearRef.current = onClear;
  const [receipt, setReceipt] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [checkError, setCheckError] = useState('');
  const [checking, setChecking] = useState(false);

  async function submit(value) {
    const next = String(value || '').trim();
    if (!next) {
      onClearRef.current();
      setCheckError('Enter the form id printed on the paper, or scan its QR code.');
      return;
    }
    setChecking(true);
    setCheckError('');
    try {
      await onMatchRef.current(next);
    } catch (caught) {
      onClearRef.current();
      setCheckError(caught.message || 'This form id does not match the application on screen');
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (!scanning) {
      return undefined;
    }
    let stopped = false;
    let stream;
    let timer;
    const video = videoRef.current;

    async function start() {
      if (!video) {
        return;
      }
      if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
        setScanError('This browser cannot scan a QR code. Type the form id instead.');
        setScanning(false);
        return;
      }
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (stopped) {
            return;
          }
          try {
            const codes = await detector.detect(video);
            const value = codes[0]?.rawValue;
            if (value) {
              stopped = true;
              setReceipt(value);
              setScanning(false);
              await submit(value);
              return;
            }
          } catch {
            // The frame is not ready yet.
          }
          timer = window.setTimeout(tick, 250);
        };
        timer = window.setTimeout(tick, 250);
      } catch {
        if (!stopped) {
          setScanError('The camera could not be opened. Type the form id instead.');
          setScanning(false);
        }
      }
    }

    start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (video) {
        video.srcObject = null;
      }
    };
  }, [scanning]);

  return (
    <div className="receipt-check">
      <p className="panel-lead">
        Type the form id from the printed paper, or scan its QR code. Physical OK stays unavailable until that code matches {applicationId}.
      </p>
      <label>
        Form id
        <input
          value={receipt}
          autoComplete="off"
          spellCheck="false"
          aria-label="Printed form id"
          onChange={(event) => {
            setReceipt(event.target.value);
            setCheckError('');
            onClear();
          }}
        />
      </label>
      <div className="receipt-check__actions">
        <ActionButton
          className="btn--primary"
          busy={checking}
          busyLabel="Checking…"
          disabled={busy || scanning}
          onClick={() => submit(receipt)}
        >
          Confirm form
        </ActionButton>
        <ActionButton
          disabled={busy || checking}
          onClick={() => {
            setScanError('');
            setScanning((current) => !current);
          }}
        >
          {scanning ? 'Stop scanner' : 'Scan QR'}
        </ActionButton>
      </div>
      {scanning ? <video ref={videoRef} className="receipt-check__video" muted playsInline /> : null}
      {matched ? (
        <p className="receipt-check__status" role="status">
          This printed form matches {applicationId}. Physical OK is available.
        </p>
      ) : null}
      {checkError ? (
        <p className="form-error" role="alert">
          {checkError}
        </p>
      ) : null}
      {scanError ? (
        <p className="form-error" role="alert">
          {scanError}
        </p>
      ) : null}
    </div>
  );
}

export function AdminCaReview({ applicationId }) {
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState('');
  const [reason, setReason] = useState('');
  const [matchedReceipt, setMatchedReceipt] = useState('');
  const busy = Boolean(pending);

  function load() {
    return caApi.get(applicationId).then((response) => {
      setApplication(response.data);
      setMatchedReceipt('');
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
            <ReceiptCheck
              applicationId={application.applicationId}
              busy={busy}
              matched={Boolean(matchedReceipt)}
              onClear={() => setMatchedReceipt('')}
              onMatch={async (receipt) => {
                await caApi.confirmReceipt(application.applicationId, receipt);
                setMatchedReceipt(receipt);
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
            {actions.verify ? (
              <ActionButton
                className="btn--primary"
                busy={pending === 'verify'}
                busyLabel="Saving…"
                disabled={busy || !matchedReceipt}
                onClick={() =>
                  run(
                    'verify',
                    () => caApi.verify(application.applicationId, { outcome: 'verified', receipt: matchedReceipt }),
                    `${application.applicationId} marked physically verified.`,
                  )
                }
              >
                Physical OK
              </ActionButton>
            ) : null}
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
