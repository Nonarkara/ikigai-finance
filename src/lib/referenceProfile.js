import { getBindings } from './cloudflare.js';

export const PROFILE_TYPES = Object.freeze(['competitor', 'client', 'partner', 'prospect']);

export const HEADCOUNT_BANDS = Object.freeze(['1-10', '11-50', '51-200', '201-500', '500+']);
export const REVENUE_BANDS = Object.freeze(['<$100K', '$100K-$1M', '$1M-$10M', '$10M-$100M', '$100M+']);
export const STAGES = Object.freeze(['pre-seed', 'seed', 'series-a', 'series-b', 'growth', 'mature', 'public', 'acquired']);

const PROFILE_FIELDS = [
  'type', 'name', 'descriptor', 'sector', 'city', 'headcount_band',
  'revenue_band', 'stage', 'why_we_track', 'tags', 'moves',
  'contact_name', 'contact_email', 'contact_role',
];

// `validateProfile` is pure: it returns a normalized object and a list of
// human-readable errors. The API route can return 400 with the error list; the
// UI can surface field-level messages.
export function validateProfile(input = {}, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (!partial || input.type !== undefined) {
    if (!PROFILE_TYPES.includes(input.type)) {
      errors.push(`type must be one of: ${PROFILE_TYPES.join(', ')}`);
    } else {
      out.type = input.type;
    }
  }

  if (!partial || input.name !== undefined) {
    const name = String(input.name ?? '').trim();
    if (!name) errors.push('name is required');
    else if (name.length > 120) errors.push('name must be 120 characters or fewer');
    else out.name = name;
  }

  for (const field of ['descriptor', 'sector', 'city', 'why_we_track', 'contact_name', 'contact_role']) {
    if (input[field] === undefined) continue;
    const value = String(input[field] ?? '').trim().slice(0, 280);
    out[field] = value;
  }
  for (const field of ['headcount_band', 'revenue_band', 'stage']) {
    if (input[field] === undefined) continue;
    out[field] = input[field] === '' ? '' : String(input[field]);
    if (out[field] && field === 'headcount_band' && !HEADCOUNT_BANDS.includes(out[field])) {
      errors.push(`headcount_band must be one of: ${HEADCOUNT_BANDS.join(', ')}`);
    }
    if (out[field] && field === 'revenue_band' && !REVENUE_BANDS.includes(out[field])) {
      errors.push(`revenue_band must be one of: ${REVENUE_BANDS.join(', ')}`);
    }
    if (out[field] && field === 'stage' && !STAGES.includes(out[field])) {
      errors.push(`stage must be one of: ${STAGES.join(', ')}`);
    }
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) errors.push('tags must be an array of strings');
    else out.tags = input.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
  }

  if (input.moves !== undefined) {
    if (!Array.isArray(input.moves)) errors.push('moves must be an array of move objects');
    else {
      out.moves = input.moves.map((move) => ({
        date: String(move?.date ?? '').slice(0, 10),
        oneLiner: String(move?.oneLiner ?? '').trim().slice(0, 240),
        sourceUrl: move?.sourceUrl ? String(move.sourceUrl).slice(0, 500) : null,
      })).filter((move) => move.date || move.oneLiner);
    }
  }

  if (input.contact_email !== undefined) {
    const email = String(input.contact_email ?? '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('contact_email must be a valid email address');
    }
    out.contact_email = email;
  }

  // Constraint: competitors are reference-only. No contact fields.
  if ((out.type || input.type) === 'competitor') {
    out.contact_name = '';
    out.contact_email = '';
    out.contact_role = '';
  }

  return { profile: out, errors };
}

function randomId() {
  return `rp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

const DEMO_PROFILES = [
  {
    id: 'demo_eda', type: 'competitor', name: 'EDA', descriptor: 'Bangkok-based analytics platform, mid-market focus.',
    sector: 'analytics', city: 'Bangkok', headcount_band: '51-200', revenue_band: '$1M-$10M', stage: 'growth',
    why_we_track: 'Closest direct competitor in mid-market analytics; watch for product launches.',
    tags: ['analytics', 'mid-market'], moves: [
      { date: '2026-04-12', oneLiner: 'Launched new dashboard product.', sourceUrl: null },
    ],
    contact_name: '', contact_email: '', contact_role: '',
    created_at: '2026-07-14T00:00:00.000Z', updated_at: '2026-07-14T00:00:00.000Z', demo: true,
  },
  {
    id: 'demo_praram9', type: 'client', name: 'Praram 9 Hospital', descriptor: 'Private hospital chain in central Bangkok.',
    sector: 'healthcare', city: 'Bangkok', headcount_band: '201-500', revenue_band: '$10M-$100M', stage: 'mature',
    why_we_track: 'Active client pilot; quarterly review meetings.',
    tags: ['healthcare', 'pilot'], moves: [
      { date: '2026-05-02', oneLiner: 'Renewed pilot for 6 more months.', sourceUrl: null },
    ],
    contact_name: 'Khun Anchalee', contact_email: 'anchalee@praram9.example', contact_role: 'CIO',
    created_at: '2026-07-14T00:00:00.000Z', updated_at: '2026-07-14T00:00:00.000Z', demo: true,
  },
];

export async function listProfiles() {
  const { env } = await getBindings();
  if (!env?.DB) return { profiles: DEMO_PROFILES, mode: 'synthetic' };
  try {
    const { results } = await env.DB.prepare('SELECT * FROM reference_profiles ORDER BY updated_at DESC LIMIT 200').all();
    return { profiles: results || [], mode: 'live' };
  } catch {
    return { profiles: DEMO_PROFILES, mode: 'synthetic' };
  }
}

export async function getProfile(id) {
  const { env } = await getBindings();
  if (!env?.DB) return DEMO_PROFILES.find((p) => p.id === id) || null;
  try {
    return await env.DB.prepare('SELECT * FROM reference_profiles WHERE id = ?').bind(id).first();
  } catch {
    return DEMO_PROFILES.find((p) => p.id === id) || null;
  }
}

export async function createProfile(input) {
  const { profile, errors } = validateProfile(input, { partial: false });
  if (errors.length) throw new ValidationError(errors);
  const now = nowIso();
  const row = {
    id: randomId(),
    ...profile,
    tags: JSON.stringify(profile.tags || []),
    moves: JSON.stringify(profile.moves || []),
    created_at: now,
    updated_at: now,
  };
  const { env } = await getBindings();
  if (!env?.DB) return { ...row, demo: true };
  try {
    await env.DB.prepare(
      'INSERT INTO reference_profiles (id, type, name, descriptor, sector, city, headcount_band, revenue_band, stage, why_we_track, tags, moves, contact_name, contact_email, contact_role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      row.id, row.type, row.name, row.descriptor || '', row.sector || '', row.city || '',
      row.headcount_band || '', row.revenue_band || '', row.stage || '', row.why_we_track || '',
      row.tags, row.moves, row.contact_name || '', row.contact_email || '', row.contact_role || '',
      row.created_at, row.updated_at,
    ).run();
    return await getProfile(row.id);
  } catch (err) {
    console.error('[referenceProfile.create]', err);
    throw new Error('Profile create failed');
  }
}

export async function updateProfile(id, input) {
  const existing = await getProfile(id);
  if (!existing) return null;
  const merged = { ...existing, ...input };
  const { profile, errors } = validateProfile(merged, { partial: false });
  if (errors.length) throw new ValidationError(errors);
  const now = nowIso();
  const { env } = await getBindings();
  if (!env?.DB) {
    return { ...existing, ...profile, tags: JSON.stringify(profile.tags || []), moves: JSON.stringify(profile.moves || []), updated_at: now, demo: true };
  }
  try {
    await env.DB.prepare(
      'UPDATE reference_profiles SET type = ?, name = ?, descriptor = ?, sector = ?, city = ?, headcount_band = ?, revenue_band = ?, stage = ?, why_we_track = ?, tags = ?, moves = ?, contact_name = ?, contact_email = ?, contact_role = ?, updated_at = ? WHERE id = ?',
    ).bind(
      profile.type, profile.name, profile.descriptor || '', profile.sector || '', profile.city || '',
      profile.headcount_band || '', profile.revenue_band || '', profile.stage || '', profile.why_we_track || '',
      JSON.stringify(profile.tags || []), JSON.stringify(profile.moves || []),
      profile.contact_name || '', profile.contact_email || '', profile.contact_role || '',
      now, id,
    ).run();
    return await getProfile(id);
  } catch (err) {
    console.error('[referenceProfile.update]', err);
    throw new Error('Profile update failed');
  }
}

export async function deleteProfile(id) {
  const existing = await getProfile(id);
  if (!existing) return false;
  const { env } = await getBindings();
  if (!env?.DB) return true;
  try {
    await env.DB.prepare('DELETE FROM reference_profiles WHERE id = ?').bind(id).run();
    return true;
  } catch (err) {
    console.error('[referenceProfile.delete]', err);
    throw new Error('Profile delete failed');
  }
}

export async function appendMove(id, move) {
  const existing = await getProfile(id);
  if (!existing) return null;
  const currentMoves = parseJsonArray(existing.moves);
  const { profile, errors } = validateProfile(
    { moves: [...currentMoves, move] },
    { partial: true },
  );
  if (errors.length) throw new ValidationError(errors);
  return updateProfile(id, { moves: profile.moves });
}

export function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class ValidationError extends Error {
  constructor(errors) {
    super(errors.join('; '));
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
