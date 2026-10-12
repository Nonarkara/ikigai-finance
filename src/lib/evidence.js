import { getBindings } from './cloudflare';
import syntheticEvidenceFile from '../../samples/synthetic/evidence.json' with { type: 'json' };
import { chooseLocalSource, privateDataDir, readPrivateJson } from './localData.js';

const REVIEW_STATUSES = new Set(['approved', 'rejected', 'needs_review', 'pending']);

function presentDocument(document, demo) {
  const row = document && typeof document === 'object' ? document : {};
  const status = REVIEW_STATUSES.has(row.status) ? row.status : 'needs_review';
  return { ...row, status, demo };
}

async function localEvidence() {
  const dir = privateDataDir();
  let read = { ok: false, reason: 'unset' };
  if (dir) {
    const file = await readPrivateJson('evidence.json');
    if (!file.ok) {
      console.warn('[evidence] private file unavailable', file.reason);
      read = file;
    } else {
      const list = Array.isArray(file.value?.documents)
        ? file.value.documents
        : (Array.isArray(file.value) ? file.value : null);
      if (!list) {
        console.warn('[evidence] private file invalid');
        read = { ok: false, reason: 'invalid' };
      } else {
        read = { ok: true, value: list.map((document) => presentDocument(document, false)) };
      }
    }
  }
  const chosen = chooseLocalSource(Boolean(dir), read, {
    synthetic: syntheticEvidenceFile.documents.map((document) => presentDocument(document, true)),
    blank: [],
  });
  return {
    documents: chosen.value,
    mode: chosen.mode,
    ...(chosen.privateStatus ? { privateStatus: chosen.privateStatus } : {}),
  };
}

export async function listEvidence() {
  const { env } = await getBindings();
  if (!env?.DB) return localEvidence();
  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM documents ORDER BY created_at DESC LIMIT 100',
    ).all();
    return { documents: results || [], mode: 'live' };
  } catch (error) {
    console.warn('[evidence] falling back to local evidence', error?.message);
    return localEvidence();
  }
}

export async function getEvidence(id) {
  const { env } = await getBindings();
  if (!env?.DB) {
    const local = await localEvidence();
    return local.documents.find((item) => item.id === id) || null;
  }
  try {
    return await env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first();
  } catch (error) {
    console.warn('[evidence] falling back to local evidence', error?.message);
    const local = await localEvidence();
    return local.documents.find((item) => item.id === id) || null;
  }
}

export async function reviewEvidence(id, status) {
  const { env } = await getBindings();
  if (!env?.DB) return { ok: true, demo: true };
  try {
    await env.DB.prepare(
      'UPDATE documents SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?',
    ).bind(status, new Date().toISOString(), 'workspace-owner', id).run();
    return { ok: true };
  } catch {
    return { ok: true, demo: true };
  }
}
