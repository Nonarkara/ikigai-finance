import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceKey, extractJson, normalizeClaim, sha256Hex } from './receipt.js';

test('extracts fenced structured OCR', () => {
  assert.deepEqual(extractJson('```json\n{"vendor":"Demo Air"}\n```'), { vendor: 'Demo Air' });
});

test('normalizes claim fields without inventing values', () => {
  const claim = normalizeClaim({ vendor: 'Demo Air', total: '42.50', currency: 'eur', confidence: 1.2 });
  assert.equal(claim.total, 42.5);
  assert.equal(claim.currency, 'EUR');
  assert.equal(claim.confidence, 1);
  assert.equal(claim.date, null);
});

test('builds private evidence path', () => {
  assert.equal(
    evidenceKey('tg_7', { date: '2026-07-14', claimCategory: 'Travel', vendor: 'Demo Air' }, 'claim.PDF'),
    'default/evidence/2026/07/travel/2026-07-14_Demo-Air_tg_7.pdf',
  );
});

test('hashes evidence deterministically', async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode('demo').buffer), '2a97516c354b68848cdbd8f54a226a0a55b21ed138e207ad6c5cbb9c00aa5aea');
});
