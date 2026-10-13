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
