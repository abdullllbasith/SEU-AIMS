import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfView({ data }) {
  const hostRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !data) {
      return undefined;
    }
    let cancelled = false;
    let task = null;
    setError('');
    task = getDocument({ data: data.slice(0) });
    task.promise
      .then(async (pdf) => {
        if (!pdf || cancelled) {
          return;
        }
        host.replaceChildren();
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) {
            return;
          }
          const page = await pdf.getPage(pageNumber);
          const unscaled = page.getViewport({ scale: 1 });
          const width = host.clientWidth || 720;
          const viewport = page.getViewport({ scale: Math.min(2, width / unscaled.width) });
          const canvas = document.createElement('canvas');
          canvas.className = 'file-preview__page';
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          host.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught?.message || 'Unable to show this PDF');
        }
      });
    return () => {
      cancelled = true;
      task?.destroy();
    };
  }, [data]);

  if (error) {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  }

  return <div ref={hostRef} className="file-preview__pages" />;
}
