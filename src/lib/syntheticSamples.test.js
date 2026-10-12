import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import financeSample from '../../samples/synthetic/finance-snapshot.json' with { type: 'json' };
import profileSample from '../../samples/synthetic/reference-profiles.json' with { type: 'json' };
import evidenceSample from '../../samples/synthetic/evidence.json' with { type: 'json' };
import { evaluateBalanceSheetPayload } from './finance/diagnostic.js';
import { validateProfile } from './referenceProfile.js';

test('committed samples are labelled synthetic and the statement balances', () => {
  for (const sample of [financeSample, profileSample, evidenceSample]) {
    assert.equal(sample.synthetic, true);
    assert.match(sample.label, /^SYNTHETIC SAMPLE/);
  }

  const result = evaluateBalanceSheetPayload(financeSample.payload);
  assert.equal(financeSample.payload.companyName, 'Sample Company');
  assert.equal(result.dataQuality.balanceCheck.status, 'verified');
  assert.equal(result.metrics.totalAssets, 600000);
  assert.equal(result.metrics.equity, 400000);
});

test('synthetic reference profiles are fictional and valid', () => {
  assert.equal(profileSample.profiles.length, 2);
  for (const profile of profileSample.profiles) {
    assert.match(profile.name, /^Synthetic /);
    const { errors } = validateProfile(profile);
    assert.deepEqual(errors, []);
  }
});

test('synthetic evidence stays a proposal until a status is already on the row', () => {
  assert.equal(evidenceSample.documents[0].status, 'needs_review');
  assert.equal(evidenceSample.documents[0].booking_reference, 'DEMO42');
  assert.ok(evidenceSample.documents.every((item) => item.demo === true));
  assert.ok(evidenceSample.documents.every((item) => ['needs_review', 'approved', 'rejected', 'pending'].includes(item.status)));
});

test('sample files on disk keep the synthetic marker the boundary audit requires', async () => {
  for (const name of ['finance-snapshot.json', 'reference-profiles.json', 'evidence.json']) {
    const text = await readFile(new URL(`../../samples/synthetic/${name}`, import.meta.url), 'utf8');
    assert.match(text, /"synthetic": true/);
    assert.match(text, /SYNTHETIC SAMPLE/);
  }
});
