import { getBindings } from './cloudflare.js';

const SINGLETON_ID = 'singleton';

const DEMO_WORKSPACE = {
  id: SINGLETON_ID,
  name: 'My Company',
  descriptor: 'One-line description of what we do.',
  sector: '',
  city: '',
  headcount_band: '',
  revenue_band: '',
  stage: '',
  why_we_track: '',
  created_at: '2026-07-14T00:00:00.000Z',
  updated_at: '2026-07-14T00:00:00.000Z',
  demo: true,
};

const ALLOWED_FIELDS = [
  'name', 'descriptor', 'sector', 'city', 'headcount_band',
  'revenue_band', 'stage', 'why_we_track',
];

function sanitize(input = {}) {
  const out = {};
  for (const field of ALLOWED_FIELDS) {
    if (input[field] !== undefined) out[field] = String(input[field] ?? '').trim().slice(0, 280);
  }
  if (!out.name) out.name = '';
  return out;
}

export async function getWorkspace() {
  const { env } = await getBindings();
  if (!env?.DB) return DEMO_WORKSPACE;
  try {
    const row = await env.DB.prepare('SELECT * FROM workspace WHERE id = ?').bind(SINGLETON_ID).first();
    if (row) return row;
    // First-read auto-seed so the operator has something to edit immediately.
    const seed = { ...DEMO_WORKSPACE, demo: false };
    await env.DB.prepare(
      'INSERT INTO workspace (id, name, descriptor, sector, city, headcount_band, revenue_band, stage, why_we_track, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(SINGLETON_ID, seed.name, seed.descriptor, seed.sector, seed.city, seed.headcount_band, seed.revenue_band, seed.stage, seed.why_we_track, seed.created_at, seed.updated_at).run();
    return seed;
  } catch (err) {
    console.warn('[workspace] falling back to demo', err?.message);
    return DEMO_WORKSPACE;
  }
}

export async function updateWorkspace(input) {
  const clean = sanitize(input);
  const now = new Date().toISOString();
  const { env } = await getBindings();
  if (!env?.DB) {
    return { ...DEMO_WORKSPACE, ...clean, updated_at: now, demo: true };
  }
  try {
    const existing = await env.DB.prepare('SELECT * FROM workspace WHERE id = ?').bind(SINGLETON_ID).first();
    if (!existing) {
      await env.DB.prepare(
        'INSERT INTO workspace (id, name, descriptor, sector, city, headcount_band, revenue_band, stage, why_we_track, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(SINGLETON_ID, clean.name, clean.descriptor || '', clean.sector || '', clean.city || '', clean.headcount_band || '', clean.revenue_band || '', clean.stage || '', clean.why_we_track || '', now, now).run();
    } else {
      await env.DB.prepare(
        'UPDATE workspace SET name = ?, descriptor = ?, sector = ?, city = ?, headcount_band = ?, revenue_band = ?, stage = ?, why_we_track = ?, updated_at = ? WHERE id = ?',
      ).bind(clean.name, clean.descriptor || '', clean.sector || '', clean.city || '', clean.headcount_band || '', clean.revenue_band || '', clean.stage || '', clean.why_we_track || '', now, SINGLETON_ID).run();
    }
    return await getWorkspace();
  } catch (err) {
    console.error('[workspace] update failed', err);
    throw new Error('Workspace update failed');
  }
}
