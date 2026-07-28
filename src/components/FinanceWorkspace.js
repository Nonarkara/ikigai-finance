'use client';

import { useEffect, useState } from 'react';

const BALANCE_GROUPS = [
  {
    label: 'Assets',
    fields: [
      ['cash', 'Cash'],
      ['accountsReceivable', 'Accounts receivable'],
      ['inventory', 'Inventory'],
      ['otherCurrentAssets', 'Other current assets'],
      ['totalCurrentAssets', 'Total current assets'],
      ['fixedAssets', 'Fixed assets'],
      ['otherNonCurrentAssets', 'Other non-current assets'],
      ['totalAssets', 'Total assets'],
    ],
  },
  {
    label: 'Liabilities',
    fields: [
      ['accountsPayable', 'Accounts payable'],
      ['shortTermDebt', 'Short-term debt'],
      ['otherCurrentLiabilities', 'Other current liabilities'],
      ['totalCurrentLiabilities', 'Total current liabilities'],
      ['longTermDebt', 'Long-term debt'],
      ['otherNonCurrentLiabilities', 'Other non-current liabilities'],
      ['totalLiabilities', 'Total liabilities'],
    ],
  },
  {
    label: 'Equity',
    fields: [
      ['paidInCapital', 'Paid-in capital'],
      ['retainedEarnings', 'Retained earnings / accumulated loss'],
      ['equity', 'Total equity'],
    ],
  },
];

const INCOME_FIELDS = [
  ['revenue', 'Revenue'],
  ['grossProfit', 'Gross profit'],
  ['operatingExpenses', 'Operating expenses'],
  ['operatingIncome', 'Operating income / EBIT'],
  ['interestExpense', 'Interest expense'],
  ['depreciation', 'Depreciation'],
  ['netProfit', 'Net profit / loss'],
];

function number(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('en', { maximumFractionDigits }).format(value);
}

function amount(value, currency) {
  if (value === null || value === undefined) return '—';
  const prefix = currency && currency !== 'UNSPECIFIED' ? `${currency} ` : '';
  return `${prefix}${number(value, 0)}`;
}

function emptyPayload() {
  return {
    companyName: 'My Company',
    currency: 'USD',
    periodEnding: '',
    sheetUrl: '',
    analysisOptions: { altmanModel: '' },
    balanceSheet: Object.fromEntries(BALANCE_GROUPS.flatMap((group) => group.fields).map(([field]) => [field, ''])),
    incomeStatement: Object.fromEntries(INCOME_FIELDS.map(([field]) => [field, ''])),
  };
}

export default function FinanceWorkspace() {
  const [model, setModel] = useState(null);
  const [draft, setDraft] = useState(emptyPayload());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/finance', { cache: 'no-store' });
    if (!response.ok) throw new Error('Financial model could not be loaded.');
    const next = await response.json();
    setModel(next);
    setDraft(next.snapshot.payload);
  }

  useEffect(() => {
    let cancelled = false;
    fetch('/api/finance', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((next) => {
        if (cancelled || !next) return;
        setModel(next);
        setDraft(next.snapshot.payload);
      });
    return () => { cancelled = true; };
  }, []);

  function updateRoot(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateStatement(statement, field, value) {
    setDraft((current) => ({
      ...current,
      [statement]: { ...current[statement], [field]: value },
    }));
  }

  async function save() {
    setSaving(true);
    setError('');
    const response = await fetch('/api/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: draft,
        expectedRevision: model.snapshot.revision,
      }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(result.error || 'Save failed.');
      if (response.status === 409 || response.status === 423) await load();
      return;
    }
    setModel(result);
    setDraft(result.snapshot.payload);
    setEditing(false);
  }

  async function setLock(locked) {
    setSaving(true);
    setError('');
    const response = await fetch('/api/finance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_lock',
        locked,
        expectedRevision: model.snapshot.revision,
      }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(result.error || 'Lock action failed.');
      await load();
      return;
    }
    setModel(result);
    setDraft(result.snapshot.payload);
    if (locked) setEditing(false);
  }

  function cancel() {
    setDraft(model.snapshot.payload);
    setEditing(false);
    setError('');
  }

  if (!model) {
    return (
      <section className="finance-workspace">
        <div className="section-head">
          <div><div className="eyebrow">FINANCE CORE</div><h2>Financial model</h2></div>
        </div>
        <p className="empty">Loading financial model…</p>
      </section>
    );
  }

  const { snapshot, evaluation, sheetSync } = model;
  const { decision, dataQuality, metrics } = evaluation;
  const currency = evaluation.currency;

  return (
    <section className="finance-workspace">
      <div className="section-head">
        <div>
          <div className="eyebrow">FINANCE CORE · MODEL {evaluation.model.version}</div>
          <h2>Financial model</h2>
          <p className="section-hint">
            Assets must equal liabilities plus equity. Every conclusion records its formula, missing evidence, and confidence.
          </p>
        </div>
        <div className="finance-actions">
          {snapshot.payload.sheetUrl && (
            <a href={snapshot.payload.sheetUrl} target="_blank" rel="noreferrer">Open Sheet</a>
          )}
          {!editing && !snapshot.locked && (
            <button className="secondary" onClick={() => setEditing(true)}>Edit numbers</button>
          )}
          <button className="secondary" onClick={() => setLock(!snapshot.locked)} disabled={saving}>
            {snapshot.locked ? 'Unlock model' : 'Lock model'}
          </button>
        </div>
      </div>

      <div className="finance-state-row">
        <span className={`finance-state finance-state--${decision.color}`}>{decision.verdict}</span>
        <span>{decision.classification}</span>
        <span>Confidence: {dataQuality.confidence}</span>
        <span>Revision {snapshot.revision}</span>
        <span>{snapshot.locked ? 'Locked' : 'Editable'}</span>
      </div>

      {snapshot.demo && (
        <div className="finance-notice">
          Synthetic local statement. Configure D1 before relying on saved edits.
        </div>
      )}
      {dataQuality.balanceCheck.status !== 'verified' && (
        <div className={`finance-notice finance-notice--${dataQuality.balanceCheck.status === 'failed' ? 'red' : 'amber'}`}>
          Balance check: {dataQuality.balanceCheck.status}. {dataQuality.balanceCheck.note || `Residual ${amount(dataQuality.balanceCheck.residual, currency)}.`}
        </div>
      )}
      {sheetSync?.status === 'error' && (
        <div className="finance-notice finance-notice--amber">
          Saved locally; Google Sheets push failed: {sheetSync.error}
        </div>
      )}
      {error && <div className="error finance-error">{error}</div>}

      {!editing ? (
        <>
          <div className="finance-metrics">
            <Metric label="Total assets" value={amount(metrics.totalAssets, currency)} />
            <Metric label="Book equity" value={amount(metrics.equity, currency)} />
            <Metric label="Working capital" value={amount(metrics.workingCapital, currency)} />
            <Metric label="Current ratio" value={metrics.currentRatio === null ? '—' : `${number(metrics.currentRatio)}×`} />
            <Metric label="Liabilities / assets" value={metrics.liabilitiesToAssets === null ? '—' : `${number(metrics.liabilitiesToAssets * 100)}%`} />
            <Metric label="Net margin" value={metrics.netMarginPct === null ? '—' : `${number(metrics.netMarginPct)}%`} />
          </div>

          <div className="finance-argument">
            <ArgumentColumn title="What works" items={decision.positives.map((item) => `${item.claim} ${item.evidence}`)} empty="No positive conclusion is supported yet." />
            <ArgumentColumn title="Risks" items={decision.risks.map((item) => `${item.claim} ${item.evidence}`)} empty="No red flag is supported by the supplied statement." />
            <ArgumentColumn title="What it needs" items={decision.needs.map((item) => `${item.priority}: ${item.title}. ${item.action}`)} empty="No immediate financial repair is identified." />
          </div>

          <details className="finance-details">
            <summary>Formula record and missing evidence</summary>
            <div className="finance-details-grid">
              <div>
                <h3>Formula record</h3>
                <p>Balance: {dataQuality.balanceCheck.formula}</p>
                <p>Liquidity: {evaluation.metricDetails.currentRatio.formula}</p>
                <p>Leverage: {evaluation.metricDetails.liabilitiesToAssets.formula}</p>
                <p>Margin: {evaluation.metricDetails.netMarginPct.formula}</p>
                <p>Altman: {evaluation.metricDetails.altmanZScore.note}</p>
              </div>
              <div>
                <h3>Next evidence</h3>
                <ul>{decision.questions.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            </div>
          </details>
        </>
      ) : (
        <div className="finance-form">
          <div className="field-row field-row--three">
            <Field label="Company name">
              <input value={draft.companyName} onChange={(event) => updateRoot('companyName', event.target.value)} maxLength={160} />
            </Field>
            <Field label="Currency">
              <input value={draft.currency} onChange={(event) => updateRoot('currency', event.target.value.toUpperCase())} maxLength={3} placeholder="USD" />
            </Field>
            <Field label="Period ending">
              <input type="date" value={draft.periodEnding} onChange={(event) => updateRoot('periodEnding', event.target.value)} />
            </Field>
          </div>
          <div className="field-row field-row--two">
            <Field label="Google Sheet URL">
              <input value={draft.sheetUrl} onChange={(event) => updateRoot('sheetUrl', event.target.value)} placeholder="https://docs.google.com/spreadsheets/…" />
            </Field>
            <Field label="Altman model">
              <select
                value={draft.analysisOptions?.altmanModel || ''}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  analysisOptions: { altmanModel: event.target.value },
                }))}
              >
                <option value="">Not selected</option>
                <option value="private-non-manufacturing">Private non-manufacturing</option>
                <option value="private-manufacturing">Private manufacturing</option>
              </select>
            </Field>
          </div>

          {BALANCE_GROUPS.map((group) => (
            <fieldset className="finance-fieldset" key={group.label}>
              <legend>{group.label}</legend>
              <div className="finance-input-grid">
                {group.fields.map(([field, label]) => (
                  <Field label={label} key={field}>
                    <input
                      inputMode="decimal"
                      value={draft.balanceSheet[field] ?? ''}
                      onChange={(event) => updateStatement('balanceSheet', field, event.target.value)}
                    />
                  </Field>
                ))}
              </div>
            </fieldset>
          ))}

          <fieldset className="finance-fieldset">
            <legend>Income statement · optional but required for an investment screen</legend>
            <div className="finance-input-grid">
              {INCOME_FIELDS.map(([field, label]) => (
                <Field label={label} key={field}>
                  <input
                    inputMode="decimal"
                    value={draft.incomeStatement[field] ?? ''}
                    onChange={(event) => updateStatement('incomeStatement', field, event.target.value)}
                  />
                </Field>
              ))}
            </div>
          </fieldset>

          <div className="workspace-actions">
            <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save and analyze'}</button>
            <button className="secondary" onClick={cancel} disabled={saving}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }) {
  return <article><span>{label}</span><strong>{value}</strong></article>;
}

function ArgumentColumn({ title, items, empty }) {
  return (
    <article>
      <h3>{title}</h3>
      {items.length > 0 ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}
    </article>
  );
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
