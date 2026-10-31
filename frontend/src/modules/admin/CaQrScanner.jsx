import { useEffect, useRef, useState } from 'react';
import { ActionButton } from '../../ui/ActionButton.jsx';

/**
 * Reads a CA application's QR code with the camera, or takes the Application ID typed by hand.
 * The admin must first confirm they inspected the printed form and the physical HOD signature;
 * only then can a scan or a typed ID be submitted. `onSubmit(receipt)` does the verification and may
 * return a message to show. Verification never approves: that stays a separate admin action.
 *
 * Decoding uses the browser's BarcodeDetector when it exists, and jsQR (loaded on demand) otherwise.
 */
export function CaQrScanner({ busy = false, onSubmit, idLabel = 'Application ID', hint }) {
  const videoRef = useRef(null);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const [inspected, setInspected] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [checking, setChecking] = useState(false);

  async function submit(value) {
    const next = String(value || '').trim();
    setSuccess('');
    if (!next) {
      setError(`Scan the QR code or enter the ${idLabel}.`);
      return;
    }
    setChecking(true);
    setError('');
    try {
      const message = await onSubmitRef.current(next);
      setSuccess(typeof message === 'string' ? message : 'Verified.');
      setReceipt('');
    } catch (caught) {
      setError(caught.message || 'This form could not be verified. Enter the Application ID instead.');
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
      if (!navigator.mediaDevices?.getUserMedia) {
        setScanError(`This browser cannot open the camera. Enter the ${idLabel} instead.`);
        setScanning(false);
        return;
      }
      try {
        let detect;
        if (window.BarcodeDetector) {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          detect = async () => (await detector.detect(video))[0]?.rawValue;
        } else {
          const { default: jsQR } = await import('jsqr');
          const canvas = document.createElement('canvas');
          detect = async () => {
            if (!video.videoWidth || !video.videoHeight) {
              return undefined;
            }
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = context.getImageData(0, 0, canvas.width, canvas.height);
            return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })?.data;
          };
        }
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
        const tick = async () => {
          if (stopped) {
            return;
          }
          try {
            const value = await detect();
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
          setScanError(`The camera could not be opened. Enter the ${idLabel} instead.`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const locked = !inspected;

  return (
    <div className="receipt-check">
      <label className="receipt-check__inspect">
        <input
          type="checkbox"
          checked={inspected}
          onChange={(event) => {
            setInspected(event.target.checked);
            if (!event.target.checked) {
              setScanning(false);
            }
          }}
        />{' '}
        I have inspected the printed form and the physical HOD signature
      </label>
      <p className="panel-lead">
        {hint || `Scan the QR code on the printed form, or type the ${idLabel}. Verifying does not approve the application.`}
      </p>
      <label>
        {idLabel}
        <input
          value={receipt}
          autoComplete="off"
          spellCheck="false"
          aria-label={idLabel}
          onChange={(event) => {
            setReceipt(event.target.value);
            setError('');
            setSuccess('');
          }}
        />
      </label>
      <div className="receipt-check__actions">
        <ActionButton
          className="btn--primary"
          busy={checking}
          busyLabel="Verifying…"
          disabled={busy || scanning || locked}
          onClick={() => submit(receipt)}
        >
          Verify {idLabel}
        </ActionButton>
        <ActionButton
          disabled={busy || checking || locked}
          onClick={() => {
            setScanError('');
            setScanning((current) => !current);
          }}
        >
          {scanning ? 'Stop scanner' : 'Scan QR'}
        </ActionButton>
      </div>
      {locked ? <p className="panel-lead">Tick the box above to enable scanning and verification.</p> : null}
      {scanning ? <video ref={videoRef} className="receipt-check__video" muted playsInline /> : null}
      {success ? (
        <p className="receipt-check__status" role="status">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
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
