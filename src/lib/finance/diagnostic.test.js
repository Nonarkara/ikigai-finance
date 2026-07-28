import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBalanceSheetPayload } from './diagnostic.js';

const HEALTHY = {
  companyName: 'Apex Tech Co., Ltd.',
  currency: 'THB',
  periodEnding: '2026-12-31',
  balanceSheet: {
    cash: '5,000,000',
    accountsReceivable: 3000000,
    inventory: 1000000,
    totalCurrentAssets: 9000000,
    fixedAssets: 10000000,
    totalAssets: 19000000,
    accountsPayable: 2000000,
    shortTermDebt: 1000000,
    totalCurrentLiabilities: 3000000,
    longTermDebt: 3000000,
    totalLiabilities: 6000000,
    paidInCapital: 5000000,
    retainedEarnings: 8000000,
    equity: 13000000,
  },
  incomeStatement: {
    revenue: 20000000,
    grossProfit: 10000000,
    operatingExpenses: 5000000,
    operatingIncome: 5000000,
    interestExpense: 200000,
    netProfit: 4800000,
  },
};

test('verifies a balanced, profitable company and exposes formula lineage', () => {
  const result = evaluateBalanceSheetPayload(HEALTHY);
  assert.equal(result.dataQuality.balanceCheck.status, 'verified');
  assert.equal(result.decision.state, 'passes-first-screen');
  assert.equal(result.metrics.currentRatio, 3);
  assert.equal(result.metricDetails.currentRatio.formula, 'Total Current Assets ÷ Total Current Liabilities');
  assert.equal(result.metrics.equity, 13000000);
  assert.equal(result.currency, 'THB');
});

test('never invents capital, gross margin, or an investability conclusion from an empty payload', () => {
  const result = evaluateBalanceSheetPayload({});
  assert.equal(result.metrics.paidInCapital, null);
  assert.equal(result.metrics.grossProfit, null);
  assert.equal(result.metrics.altmanZScore, null);
  assert.equal(result.decision.state, 'unassessable');
  assert.equal(result.dataQuality.confidence, 'low');
  assert.ok(result.dataQuality.missingCore.includes('totalAssets'));
  assert.ok(result.decision.needs.some((item) => item.title === 'Complete the accounting equation'));
  assert.ok(result.decision.needs.some((item) => item.title === 'Add a same-period income statement'));
});

test('blocks conclusions when the reported balance sheet does not balance', () => {
  const result = evaluateBalanceSheetPayload({
    currency: 'USD',
    balanceSheet: {
      totalAssets: 1000,
      totalLiabilities: 900,
      equity: 500,
    },
  });
  assert.equal(result.dataQuality.balanceCheck.status, 'failed');
  assert.equal(result.dataQuality.balanceCheck.residual, -400);
  assert.equal(result.decision.state, 'unassessable');
  assert.ok(result.decision.needs.some((item) => item.title === 'Reconcile the balance sheet'));
});

test('treats negative equity as distress and does not fabricate debt-to-equity', () => {
  const result = evaluateBalanceSheetPayload({
    currency: 'THB',
    balanceSheet: {
      totalCurrentAssets: 940000,
      totalAssets: 3340000,
      totalCurrentLiabilities: 7800000,
      totalLiabilities: 9540000,
      paidInCapital: 7500000,
      retainedEarnings: -13700000,
      equity: -6200000,
    },
    incomeStatement: {
      revenue: 10000000,
      operatingIncome: 200000,
      interestExpense: 180000,
      netProfit: 20000,
    },
  });
  assert.equal(result.dataQuality.balanceCheck.status, 'verified');
  assert.equal(result.decision.state, 'distressed');
  assert.equal(result.metrics.debtToEquity, null);
  assert.equal(result.metricDetails.debtToEquity.quality, 'not-meaningful');
});

test('accepts nested engine balance-sheet output and labels derived totals', () => {
  const result = evaluateBalanceSheetPayload({
    currency: 'THB',
    balanceSheet: {
      assets: { cash: 500, accountsReceivable: 500, currentAssets: 1000, fixedAssets: 2000, total: 3000 },
      liabilities: { accountsPayable: 400, shortTermDebt: 100, currentLiabilities: 500, longTermDebt: 500, total: 1000 },
      equity: { capital: 1000, retainedEarnings: 1000, total: 2000 },
    },
  });
  assert.equal(result.dataQuality.balanceCheck.status, 'verified');
  assert.equal(result.metrics.totalAssets, 3000);
  assert.equal(result.metrics.equity, 2000);
  assert.equal(result.decision.state, 'conditional');
});

test('uses the selected Altman model and does not apply a universal model silently', () => {
  const withoutModel = evaluateBalanceSheetPayload(HEALTHY);
  assert.equal(withoutModel.metrics.altmanZScore, null);

  const withModel = evaluateBalanceSheetPayload({
    ...HEALTHY,
    analysisOptions: { altmanModel: 'private-non-manufacturing' },
  });
  assert.ok(Number.isFinite(withModel.metrics.altmanZScore));
  assert.equal(withModel.metricDetails.altmanZScore.model, 'private-non-manufacturing');
  assert.match(withModel.metricDetails.altmanZScore.note, /not a probability/i);
});

test('rejects unreadable numeric strings without serializing Infinity or NaN', () => {
  const result = evaluateBalanceSheetPayload({
    balanceSheet: {
      totalAssets: 'one million',
      totalLiabilities: 0,
      equity: 1000000,
    },
  });
  assert.ok(result.dataQuality.errors.some((item) => item.code === 'invalid_number'));
  assert.equal(result.decision.state, 'unassessable');
  assert.doesNotMatch(JSON.stringify(result), /Infinity|NaN/);
});
