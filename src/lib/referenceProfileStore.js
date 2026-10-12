import { getBindings } from './cloudflare.js';
import syntheticProfilesFile from '../../samples/synthetic/reference-profiles.json' with { type: 'json' };
import { chooseLocalSource, privateDataDir, readPrivateJson } from './localData.js';
import { parseJsonArray, validateProfile, ValidationError } from './referenceProfile.js';

function randomId() {
  return `rp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

async function localProfiles() {
  const dir = privateDataDir();
  let read = { ok: false, reason: 'unset' };
  if (dir) {
    const file = await readPrivateJson('reference-profiles.json');
    if (!file.ok) {
      console.warn('[profiles] private file unavailable', file.reason);
      read = file;
    } else {
      const list = Array.isArray(file.value?.profiles)
        ? file.value.profiles
        : (Array.isArray(file.value) ? file.value : null);
      if (!list) {
        console.warn('[profiles] private file invalid');
        read = { ok: false, reason: 'invalid' };
      } else {
        const accepted = [];
        for (const item of list) {
          if (!item || typeof item !== 'object') continue;
          const { profile, errors } = validateProfile(item, { partial: false });
          if (errors.length) continue;
          accepted.push({
            id: String(item?.id || `private_${accepted.length}`),
            ...profile,
            created_at: item?.created_at || '',
            updated_at: item?.updated_at || '',
            demo: false,
          });
        }
        read = list.length > 0 && accepted.length === 0
          ? { ok: false, reason: 'invalid' }
          : { ok: true, value: accepted };
      }
    }
  }
  const chosen = chooseLocalSource(Boolean(dir), read, {
    synthetic: syntheticProfilesFile.profiles.map((profile) => ({ ...profile, demo: true })),
    blank: [],
  });
  return {
    profiles: chosen.value,
    mode: chosen.mode,
    ...(chosen.privateStatus ? { privateStatus: chosen.privateStatus } : {}),
  };
}

export async function listProfiles() {
  const { env } = await getBindings();
  if (!env?.DB) return localProfiles();
  try {
    const { results } = await env.DB.prepare('SELECT * FROM reference_profiles ORDER BY updated_at DESC LIMIT 200').all();
    return { profiles: results || [], mode: 'live' };
  } catch (error) {
    console.warn('[profiles] falling back to local profiles', error?.message);
    return localProfiles();
  }
}

export async function getProfile(id) {
  const { env } = await getBindings();
  if (!env?.DB) {
    const local = await localProfiles();
    return local.profiles.find((profile) => profile.id === id) || null;
  }
  try {
    return await env.DB.prepare('SELECT * FROM reference_profiles WHERE id = ?').bind(id).first();
  } catch (error) {
    console.warn('[profiles] falling back to local profile', error?.message);
    const local = await localProfiles();
    return local.profiles.find((profile) => profile.id === id) || null;
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
