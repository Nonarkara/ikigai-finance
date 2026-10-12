import { join, resolve } from 'node:path';

const MAX_BYTES = 1_000_000;
const ALLOWED_FILES = new Set([
  'finance-snapshot.json',
  'reference-profiles.json',
  'evidence.json',
]);

/**
 * Local stand-in when D1 is absent.
 * Unset IKIGAI_PRIVATE_DATA_DIR → committed synthetic sample.
 * Directory set → that directory's JSON, or a blank value when the file is
 * missing or unreadable. A missing private file is not filled with the sample.
 */
export function privateDataDir() {
  const raw = process.env.IKIGAI_PRIVATE_DATA_DIR;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return resolve(raw.trim());
}

export function chooseLocalSource(hasPrivateDir, read, { synthetic, blank }) {
  if (!hasPrivateDir) {
    return { value: synthetic, mode: 'synthetic', privateStatus: null };
  }
  if (!read?.ok) {
    return {
      value: blank,
      mode: 'private',
      privateStatus: read?.reason && read.reason !== 'unset' ? read.reason : 'missing',
    };
  }
  return { value: read.value, mode: 'private', privateStatus: 'loaded' };
}

export async function readPrivateJson(filename) {
  if (!ALLOWED_FILES.has(filename)) return { ok: false, reason: 'invalid' };
  const dir = privateDataDir();
  if (!dir) return { ok: false, reason: 'unset' };

  // Indirect import so the client bundle, which shares a few modules with the
  // server, does not try to resolve node:fs.
  let fs;
  try {
    const importer = new Function('specifier', 'return import(specifier)');
    fs = await importer('node:fs/promises');
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  try {
    const info = await fs.stat(join(dir, filename));
    if (!info.isFile() || info.size > MAX_BYTES) return { ok: false, reason: 'invalid' };
    const text = await fs.readFile(join(dir, filename), 'utf8');
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, reason: 'missing' };
    return { ok: false, reason: 'invalid' };
  }
}
