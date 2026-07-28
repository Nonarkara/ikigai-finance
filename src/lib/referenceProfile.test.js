import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_TYPES,
  HEADCOUNT_BANDS,
  REVENUE_BANDS,
  STAGES,
  validateProfile,
  parseJsonArray,
} from './referenceProfile.js';

const base = {
  type: 'competitor',
  name: 'EDA',
  descriptor: 'Bangkok analytics platform',
  sector: 'analytics',
  city: 'Bangkok',
  headcount_band: '51-200',
  revenue_band: '$1M-$10M',
  stage: 'growth',
  why_we_track: 'Closest direct competitor.',
  tags: ['analytics', 'mid-market'],
};

test('validateProfile accepts a full competitor profile and clears contact fields', () => {
  const { profile, errors } = validateProfile({
    ...base,
    contact_name: 'should be cleared',
    contact_email: 'should@be.cleared',
  });
  assert.equal(errors.length, 0);
  assert.equal(profile.name, 'EDA');
  assert.equal(profile.contact_name, '');
  assert.equal(profile.contact_email, '');
  assert.deepEqual(profile.tags, ['analytics', 'mid-market']);
});

test('validateProfile rejects missing name and bad type', () => {
  const { errors } = validateProfile({ type: 'vendor' });
  assert.ok(errors.some((e) => e.includes('type')));
  assert.ok(errors.some((e) => e.includes('name')));
});

test('validateProfile accepts a client with contact fields', () => {
  const { profile, errors } = validateProfile({
    type: 'client',
    name: 'Praram 9',
    contact_name: 'Khun A',
    contact_email: 'a@praram9.example',
    contact_role: 'CIO',
  });
  assert.equal(errors.length, 0);
  assert.equal(profile.contact_email, 'a@praram9.example');
});

test('validateProfile rejects an invalid contact email', () => {
  const { errors } = validateProfile({
    type: 'client',
    name: 'Test',
    contact_email: 'not-an-email',
  });
  assert.ok(errors.some((e) => e.includes('contact_email')));
});

test('validateProfile rejects unknown band values', () => {
  const { errors } = validateProfile({
    ...base,
    headcount_band: '1000-2000',
    revenue_band: 'mega',
    stage: 'late-stage',
  });
  assert.ok(errors.length >= 3);
});

test('validateProfile in partial mode skips type when not provided', () => {
  const { errors } = validateProfile({ name: 'X' }, { partial: true });
  assert.equal(errors.length, 0);
});

test('PROFILE_TYPES, bands, and stages are frozen constants', () => {
  assert.equal(PROFILE_TYPES.length, 4);
  assert.ok(PROFILE_TYPES.includes('competitor'));
  assert.equal(HEADCOUNT_BANDS[0], '1-10');
  assert.equal(REVENUE_BANDS[REVENUE_BANDS.length - 1], '$100M+');
  assert.ok(STAGES.includes('series-a'));
});

test('parseJsonArray returns [] for null/non-array/non-JSON', () => {
  assert.deepEqual(parseJsonArray(null), []);
  assert.deepEqual(parseJsonArray('not json'), []);
  assert.deepEqual(parseJsonArray('[]'), []);
  assert.deepEqual(parseJsonArray([{ a: 1 }]), [{ a: 1 }]);
});
