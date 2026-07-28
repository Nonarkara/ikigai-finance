import { getBindings } from './cloudflare';

const DEMO_DOCUMENTS = [
  {
    id: 'demo_boarding_pass', status: 'needs_review', type: 'boarding_pass',
    vendor: 'Northstar Air', amount: 128.4, currency: 'EUR', receipt_date: '2026-07-08',
    category: 'travel', confidence: 0.91, booking_reference: 'DEMO42',
    created_at: '2026-07-08T09:10:00.000Z', demo: true,
  },
  {
    id: 'demo_hotel', status: 'approved', type: 'invoice', vendor: 'Harbor Hotel',
    amount: 312, currency: 'USD', receipt_date: '2026-07-07', category: 'lodging',
    confidence: 0.96, booking_reference: null, created_at: '2026-07-07T15:30:00.000Z', demo: true,
  },
];

export async function listEvidence() {
  const { env } = await getBindings();
  if (!env?.DB) return { documents: DEMO_DOCUMENTS, mode: 'synthetic' };
  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM documents ORDER BY created_at DESC LIMIT 100',
    ).all();
    return { documents: results || [], mode: 'live' };
  } catch {
    return { documents: DEMO_DOCUMENTS, mode: 'synthetic' };
  }
}

export async function getEvidence(id) {
  const { env } = await getBindings();
  if (!env?.DB) return DEMO_DOCUMENTS.find((item) => item.id === id) || null;
  try {
    return await env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first();
  } catch {
    return DEMO_DOCUMENTS.find((item) => item.id === id) || null;
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
