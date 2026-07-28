import { getBindings } from '../cloudflare.js';

function bytesEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function digest(value) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || ''))),
  );
}

async function configuredSheets() {
  const { env } = await getBindings();
  return {
    url: env?.GOOGLE_SHEETS_APP_URL || process.env.GOOGLE_SHEETS_APP_URL || '',
    secret: env?.GOOGLE_SHEETS_SYNC_SECRET || process.env.GOOGLE_SHEETS_SYNC_SECRET || '',
  };
}

export function isAllowedGoogleAppsScriptUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && ['script.google.com', 'script.googleusercontent.com'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export async function verifySheetsSecret(request) {
  const { secret } = await configuredSheets();
  if (!secret) return { ok: false, status: 503, error: 'Google Sheets sync is not configured.' };
  const auth = request.headers.get('authorization') || '';
  const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!supplied || !bytesEqual(await digest(supplied), await digest(secret))) {
    return { ok: false, status: 401, error: 'Invalid Google Sheets sync secret.' };
  }
  return { ok: true };
}

export async function pushSnapshotToGoogleSheets(snapshot) {
  const { url, secret } = await configuredSheets();
  if (!url || !secret) return { status: 'not-configured' };

  if (!isAllowedGoogleAppsScriptUrl(url)) {
    return { status: 'error', error: 'GOOGLE_SHEETS_APP_URL must be a Google Apps Script URL.' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'apply_snapshot',
        secret,
        snapshot: {
          payload: snapshot.payload,
          locked: snapshot.locked,
          revision: snapshot.revision,
          updatedAt: snapshot.updatedAt,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== 'ok') {
      return { status: 'error', error: result.error || `Apps Script returned ${response.status}.` };
    }
    return { status: 'synced', revision: snapshot.revision };
  } catch (error) {
    return { status: 'error', error: error.message || 'Google Sheets push failed.' };
  }
}
