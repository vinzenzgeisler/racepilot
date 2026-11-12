import { adminFetch } from '../../auth.js';

const REVOKE_DELAY_MS = 1000;

/** Downloads a protected file with the session token and hands it to the browser. */
export async function downloadProtectedFile(
  path: string,
  filename: string,
): Promise<void> {
  const response = await adminFetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Download rejected: ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}
