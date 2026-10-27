import { useEffect, useRef, useState } from 'react';

const VIEW = 280;
const OUTPUT = 512;

function coverScale(image, zoom) {
  return Math.max(VIEW / image.width, VIEW / image.height) * zoom;
}

function clampOffset(offset, image, zoom) {
  const scale = coverScale(image, zoom);
  const maxX = Math.max(0, (image.width * scale - VIEW) / 2);
  const maxY = Math.max(0, (image.height * scale - VIEW) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

export function ProfilePhotoCrop({ file, busy, onCancel, onConfirm }) {
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const drag = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const objectUrl = URL.createObjectURL(file);
    const next = new Image();
    next.onload = () => {
      if (cancelled) {
        return;
      }
      setError('');
      setImage(next);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    next.onerror = () => {
      if (!cancelled) {
        setError('This file could not be opened as a photo.');
      }
    };
    next.src = objectUrl;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  function changeZoom(value) {
    const nextZoom = Number(value);
    setZoom(nextZoom);
    if (image) {
      setOffset((current) => clampOffset(current, image, nextZoom));
    }
  }

  function onPointerDown(event) {
    if (!image) {
      return;
    }
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!drag.current || !image) {
      return;
    }
    setOffset(
      clampOffset(
        {
          x: drag.current.ox + event.clientX - drag.current.x,
          y: drag.current.oy + event.clientY - drag.current.y,
        },
        image,
        zoom,
      ),
    );
  }

  function onPointerUp() {
    drag.current = null;
  }

  async function confirm() {
    if (!image) {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext('2d');
    const scale = coverScale(image, zoom);
    const ratio = OUTPUT / VIEW;
    const drawWidth = image.width * scale * ratio;
    const drawHeight = image.height * scale * ratio;
    context.drawImage(
      image,
      (OUTPUT - drawWidth) / 2 + offset.x * ratio,
      (OUTPUT - drawHeight) / 2 + offset.y * ratio,
      drawWidth,
      drawHeight,
    );
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) {
      setError('The photo could not be prepared.');
      return;
    }
    onConfirm(new File([blob], 'profile.jpg', { type: 'image/jpeg' }));
  }

  const scale = image ? coverScale(image, zoom) : 1;
  const width = image ? image.width * scale : 0;
  const height = image ? image.height * scale : 0;

  return (
    <div className="photo-crop" role="presentation">
      <div className="photo-crop__panel" role="dialog" aria-modal="true" aria-labelledby="photo-crop-title">
        <h2 id="photo-crop-title">Crop profile photo</h2>
        <p>Drag the photo to position it. Use the slider to resize it inside the square.</p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div
          className="photo-crop__frame"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {image ? (
            <img
              src={image.src}
              alt=""
              draggable={false}
              style={{
                width,
                height,
                left: (VIEW - width) / 2 + offset.x,
                top: (VIEW - height) / 2 + offset.y,
              }}
            />
          ) : null}
        </div>
        <label className="photo-crop__zoom">
          Resize
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            disabled={!image || busy}
            onChange={(event) => changeZoom(event.target.value)}
          />
        </label>
        <div className="panel-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={!image || busy} onClick={confirm}>
            {busy ? 'Uploading…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
