import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFinancePayload } from './snapshot.js';
import { evaluateBalanceSheetPayload } from './diagnostic.js';

test('single-company snapshot keeps only the public finance schema', () => {
  const payload = sanitizeFinancePayload({
    companyName: '  My Shop  ',
    currency: 'thb',
    privateTenantId: 'must-not-survive',
    analysisOptions: { altmanModel: 'private-non-manufacturing', arbitrary: true },
    balanceSheet: { cash: '1,200', secretField: 999 },
    incomeStatement: { revenue: 5000, hidden: 1 },
  });
  assert.equal(payload.companyName, 'My Shop');
  assert.equal(payload.currency, 'THB');
  assert.equal(payload.privateTenantId, undefined);
  assert.equal(payload.balanceSheet.secretField, undefined);
  assert.equal(payload.incomeStatement.hidden, undefined);
  assert.deepEqual(payload.analysisOptions, { altmanModel: 'private-non-manufacturing' });
});

test('sanitized snapshot remains assessable by the shared engine', () => {
  const payload = sanitizeFinancePayload({
    companyName: 'One Company',
    currency: 'USD',
    balanceSheet: {
      totalCurrentAssets: 500,
      totalAssets: 1000,
      totalCurrentLiabilities: 200,
      totalLiabilities: 400,
      equity: 600,
    },
  });
  const result = evaluateBalanceSheetPayload(payload);
  assert.equal(result.dataQuality.balanceCheck.status, 'verified');
  assert.equal(result.decision.state, 'conditional');
});
