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
 * File reads run in local development only. A deployed worker uses D1.
 */
export function privateDataDir() {
  const raw = process.env.IKIGAI_PRIVATE_DATA_DIR;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return raw.trim();
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
  if (process.env.NODE_ENV === 'production') return { ok: false, reason: 'unavailable' };

  try {
    const { readFile, stat } = await import('node:fs/promises');
    const { join, isAbsolute } = await import('node:path');
    const root = isAbsolute(dir) ? dir : join(/* turbopackIgnore: true */ process.cwd(), dir);
    const filePath = join(/* turbopackIgnore: true */ root, filename);
    const info = await stat(filePath);
    if (!info.isFile() || info.size > MAX_BYTES) return { ok: false, reason: 'invalid' };
    const text = await readFile(filePath, 'utf8');
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, reason: 'missing' };
    return { ok: false, reason: 'invalid' };
  }
}
