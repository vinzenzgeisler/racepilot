import { adminFetch } from '../../../auth.js';

/**
 * A normal navigation cannot attach the session's bearer token, so the bytes are fetched
 * through the authenticated client and saved locally. The caller's signal aborts the request.
 */
export async function downloadAdminFile(
  url: string,
  fileName: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await adminFetch(url, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('Download rejected');
  const blobUrl = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }
}
