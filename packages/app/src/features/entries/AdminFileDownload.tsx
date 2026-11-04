import { useState, type MouseEvent } from 'react';
import { adminFetch } from '../../auth.js';

export function AdminFileDownload({ url }: { url: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // A normal navigation cannot attach the session's bearer token.
      // Keep authorization on the existing protected API, then save the bytes locally.
      if (
        !/^\/admin\/events\/[^/]+\/registration-form-uploads\/[^/]+$/.test(url)
      )
        throw new Error('Invalid upload download path');
      const response = await adminFetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Download rejected');
      const blobUrl = URL.createObjectURL(await response.blob());
      try {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `registration-upload-${url.split('/').at(-1)}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <a
        href={url}
        onClick={(event) => void download(event)}
        aria-disabled={busy}
      >
        {busy ? 'Datei wird geladen …' : 'Datei herunterladen'}
      </a>
      {failed && <span role="alert">Datei konnte nicht geladen werden.</span>}
    </>
  );
}
