import { getBindings } from '../cloudflare.js';
import { evaluateBalanceSheetPayload } from './diagnostic.js';

const SINGLETON_ID = 'singleton';
const ALTMAN_MODELS = new Set(['', 'private-manufacturing', 'private-non-manufacturing']);
const BALANCE_FIELDS = [
  'cash', 'accountsReceivable', 'inventory', 'otherCurrentAssets',
  'totalCurrentAssets', 'fixedAssets', 'otherNonCurrentAssets', 'totalAssets',
  'accountsPayable', 'shortTermDebt', 'otherCurrentLiabilities',
  'totalCurrentLiabilities', 'longTermDebt', 'otherNonCurrentLiabilities',
  'totalLiabilities', 'paidInCapital', 'retainedEarnings', 'equity',
];
const INCOME_FIELDS = [
  'revenue', 'grossProfit', 'operatingExpenses', 'operatingIncome',
  'interestExpense', 'depreciation', 'netProfit',
];

const EMPTY_PAYLOAD = {
  companyName: 'My Company',
  currency: 'USD',
  periodEnding: '',
  sheetUrl: '',
  analysisOptions: { altmanModel: '' },
  balanceSheet: Object.fromEntries(BALANCE_FIELDS.map((field) => [field, ''])),
  incomeStatement: Object.fromEntries(INCOME_FIELDS.map((field) => [field, ''])),
};

const DEMO_PAYLOAD = {
  ...EMPTY_PAYLOAD,
  companyName: 'Sample Company',
  periodEnding: '2026-06-30',
  balanceSheet: {
    ...EMPTY_PAYLOAD.balanceSheet,
    cash: 120000,
    accountsReceivable: 80000,
    inventory: 50000,
    totalCurrentAssets: 250000,
    fixedAssets: 350000,
    totalAssets: 600000,
    accountsPayable: 70000,
    shortTermDebt: 30000,
    totalCurrentLiabilities: 100000,
    longTermDebt: 100000,
    totalLiabilities: 200000,
    paidInCapital: 250000,
    retainedEarnings: 150000,
    equity: 400000,
  },
  incomeStatement: {
    ...EMPTY_PAYLOAD.incomeStatement,
    revenue: 900000,
    grossProfit: 450000,
    operatingExpenses: 300000,
    operatingIncome: 150000,
    interestExpense: 10000,
    netProfit: 140000,
  },
};

export class FinanceLockedError extends Error {}
export class FinanceConflictError extends Error {}
export class FinanceValidationError extends Error {
  constructor(message, evaluation) {
    super(message);
    this.evaluation = evaluation;
  }
}

function cleanText(value, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanFinancialValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  return cleanText(value, 80);
}

export function sanitizeFinancePayload(input = {}) {
  const altmanModel = cleanText(input.analysisOptions?.altmanModel, 40);
  const payload = {
    companyName: cleanText(input.companyName || 'My Company', 160) || 'My Company',
    currency: cleanText(input.currency || 'USD', 3).toUpperCase(),
    periodEnding: cleanText(input.periodEnding, 10),
    sheetUrl: cleanText(input.sheetUrl, 500),
    analysisOptions: {
      altmanModel: ALTMAN_MODELS.has(altmanModel) ? altmanModel : '',
    },
    balanceSheet: {},
    incomeStatement: {},
  };
  for (const field of BALANCE_FIELDS) {
    payload.balanceSheet[field] = cleanFinancialValue(input.balanceSheet?.[field]);
  }
  for (const field of INCOME_FIELDS) {
    payload.incomeStatement[field] = cleanFinancialValue(input.incomeStatement?.[field]);
  }
  return payload;
}

function parseRow(row, demo = false) {
  const payload = sanitizeFinancePayload(JSON.parse(row.payload_json));
  return {
    id: SINGLETON_ID,
    payload,
    locked: Boolean(row.locked),
    revision: Number(row.revision || 1),
    source: row.source || 'dashboard',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    demo,
  };
}

function localSnapshot(payload = DEMO_PAYLOAD) {
  const now = new Date().toISOString();
  return {
    id: SINGLETON_ID,
    payload,
    locked: false,
    revision: 1,
    source: 'synthetic',
    createdAt: now,
    updatedAt: now,
    demo: true,
  };
}

async function seed(db) {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO finance_snapshot
      (id, payload_json, locked, revision, source, created_at, updated_at)
     VALUES (?, ?, 0, 1, 'dashboard', ?, ?)`,
  ).bind(SINGLETON_ID, JSON.stringify(EMPTY_PAYLOAD), now, now).run();
  return {
    id: SINGLETON_ID,
    payload: EMPTY_PAYLOAD,
    locked: false,
    revision: 1,
    source: 'dashboard',
    createdAt: now,
    updatedAt: now,
    demo: false,
  };
}

export async function getFinanceSnapshot() {
  const { env } = await getBindings();
  if (!env?.DB) return localSnapshot();
  try {
    const row = await env.DB.prepare('SELECT * FROM finance_snapshot WHERE id = ?')
      .bind(SINGLETON_ID)
      .first();
    return row ? parseRow(row) : seed(env.DB);
  } catch (error) {
    console.warn('[finance] falling back to synthetic snapshot', error?.message);
    return localSnapshot();
  }
}

async function recordEvent(db, direction, status, revision, detail = null) {
  if (!db) return;
  await db.prepare(
    `INSERT INTO finance_sync_events
      (id, direction, status, revision, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(
    `finance_${crypto.randomUUID()}`,
    direction,
    status,
    revision,
    detail,
    new Date().toISOString(),
  ).run();
}

export async function updateFinanceSnapshot(input, {
  source = 'dashboard',
  expectedRevision = null,
  allowWhenLocked = false,
} = {}) {
  const payload = sanitizeFinancePayload(input);
  const evaluation = evaluateBalanceSheetPayload(payload);
  if (evaluation.dataQuality.errors.length > 0) {
    throw new FinanceValidationError('Financial input contains invalid values.', evaluation);
  }

  const current = await getFinanceSnapshot();
  if (current.locked && !allowWhenLocked) {
    throw new FinanceLockedError('Financial model is locked.');
  }
  if (expectedRevision !== null && Number(expectedRevision) !== current.revision) {
    throw new FinanceConflictError('Financial model changed after this edit started.');
  }

  const next = {
    ...current,
    payload,
    revision: current.revision + 1,
    source,
    updatedAt: new Date().toISOString(),
  };
  const { env } = await getBindings();
  if (!env?.DB) return { ...next, demo: true, evaluation };

  await env.DB.prepare(
    `UPDATE finance_snapshot
       SET payload_json = ?, revision = ?, source = ?, updated_at = ?
     WHERE id = ?`,
  ).bind(JSON.stringify(payload), next.revision, source, next.updatedAt, SINGLETON_ID).run();
  await recordEvent(env.DB, source === 'google_sheets' ? 'google_sheets' : 'dashboard', 'saved', next.revision);
  return { ...next, demo: false, evaluation };
}

export async function setFinanceLock(locked, expectedRevision = null) {
  const current = await getFinanceSnapshot();
  if (expectedRevision !== null && Number(expectedRevision) !== current.revision) {
    throw new FinanceConflictError('Financial model changed before the lock action completed.');
  }
  const next = {
    ...current,
    locked: Boolean(locked),
    revision: current.revision + 1,
    source: 'dashboard',
    updatedAt: new Date().toISOString(),
  };
  const { env } = await getBindings();
  if (!env?.DB) return { ...next, demo: true };

  await env.DB.prepare(
    `UPDATE finance_snapshot
       SET locked = ?, revision = ?, source = 'dashboard', updated_at = ?
     WHERE id = ?`,
  ).bind(next.locked ? 1 : 0, next.revision, next.updatedAt, SINGLETON_ID).run();
  await recordEvent(env.DB, 'lock', next.locked ? 'locked' : 'unlocked', next.revision);
  return { ...next, demo: false };
}

export function evaluateSnapshot(snapshot) {
  return evaluateBalanceSheetPayload(snapshot.payload);
}
