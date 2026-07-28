/**
 * Evidence-first financial diagnostic.
 *
 * Conservation law:
 *   total assets = total liabilities + total equity
 *
 * The engine screens financial condition. It does not estimate company value or
 * recommend an investment without the cash-flow, market, governance, and deal
 * terms that a real investment decision requires.
 */

export const FINANCIAL_DIAGNOSTIC_VERSION = '2.0.0';

const ALTMAN_MODELS = {
  'private-manufacturing': {
    label: 'Altman Z′ · private manufacturing',
    formula: '0.717×WC/TA + 0.847×RE/TA + 3.107×EBIT/TA + 0.420×Equity/TL + 0.998×Revenue/TA',
    safe: 2.9,
    distress: 1.23,
  },
  'private-non-manufacturing': {
    label: 'Altman Z″ · private non-manufacturing',
    formula: '6.56×WC/TA + 3.26×RE/TA + 6.72×EBIT/TA + 1.05×Equity/TL',
    safe: 2.6,
    distress: 1.1,
  },
};

const BALANCE_ALIASES = {
  cash: ['cash', 'cashOnHand', 'assets.cash'],
  accountsReceivable: ['accountsReceivable', 'ar', 'assets.accountsReceivable'],
  inventory: ['inventory', 'assets.inventory'],
  otherCurrentAssets: ['otherCurrentAssets', 'assets.otherCurrentAssets'],
  totalCurrentAssets: ['totalCurrentAssets', 'currentAssets', 'assets.currentAssets'],
  fixedAssets: ['fixedAssets', 'propertyPlantEquipment', 'propertyPlantEquipmentNet', 'ppAndE', 'assets.fixedAssets'],
  otherNonCurrentAssets: ['otherNonCurrentAssets', 'assets.otherNonCurrentAssets'],
  totalAssets: ['totalAssets', 'assets.total'],
  accountsPayable: ['accountsPayable', 'ap', 'liabilities.accountsPayable'],
  shortTermDebt: ['shortTermDebt', 'shortTermLoans', 'bankOverdrafts', 'liabilities.shortTermDebt'],
  otherCurrentLiabilities: ['otherCurrentLiabilities', 'liabilities.otherCurrentLiabilities'],
  totalCurrentLiabilities: ['totalCurrentLiabilities', 'currentLiabilities', 'liabilities.currentLiabilities'],
  longTermDebt: ['longTermDebt', 'longTermLoans', 'liabilities.longTermDebt'],
  otherNonCurrentLiabilities: ['otherNonCurrentLiabilities', 'liabilities.otherNonCurrentLiabilities'],
  totalLiabilities: ['totalLiabilities', 'liabilities.total'],
  paidInCapital: ['paidInCapital', 'capital', 'equity.capital'],
  retainedEarnings: ['retainedEarnings', 'retainedDeficits', 'equity.retainedEarnings'],
  equity: ['equity.total', 'totalEquity', 'shareholdersEquity', 'equity'],
};

const INCOME_ALIASES = {
  revenue: ['revenue', 'netSales'],
  grossProfit: ['grossProfit'],
  operatingExpenses: ['operatingExpenses', 'opex'],
  operatingIncome: ['operatingIncome', 'ebit'],
  interestExpense: ['interestExpense'],
  depreciation: ['depreciation'],
  netProfit: ['netProfit', 'netIncome'],
};

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function getPath(source, path) {
  return path.split('.').reduce((value, key) => {
    if (value == null || typeof value !== 'object') return undefined;
    return value[key];
  }, source);
}

function firstValue(source, aliases) {
  for (const alias of aliases) {
    const value = getPath(source, alias);
    if (value !== undefined && value !== null && value !== '') return { value, alias };
  }
  return { value: null, alias: null };
}

function parseNumber(raw, field, errors) {
  if (raw === null) return null;
  if (typeof raw === 'number') {
    if (Number.isFinite(raw)) return raw;
    errors.push({ code: 'invalid_number', field, message: `${field} must be a finite number.` });
    return null;
  }
  if (typeof raw !== 'string') {
    errors.push({ code: 'invalid_number', field, message: `${field} must be a number or numeric string.` });
    return null;
  }
  let normalized = raw.trim();
  const negative = /^\(.*\)$/.test(normalized);
  normalized = normalized
    .replace(/^\((.*)\)$/, '$1')
    .replace(/[,\s]/g, '')
    .replace(/^[A-Z]{3}/i, '')
    .replace(/[฿$€£¥]/g, '');
  if (!normalized || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
    errors.push({ code: 'invalid_number', field, message: `${field} contains an unreadable number.` });
    return null;
  }
  const value = Number(normalized) * (negative ? -1 : 1);
  if (!Number.isFinite(value)) {
    errors.push({ code: 'invalid_number', field, message: `${field} must be a finite number.` });
    return null;
  }
  return value;
}

function readFields(source, aliasMap, errors) {
  const values = {};
  const provenance = {};
  for (const [field, aliases] of Object.entries(aliasMap)) {
    const found = firstValue(source, aliases);
    values[field] = parseNumber(found.value, field, errors);
    provenance[field] = found.alias
      ? { basis: 'reported', sourceField: found.alias }
      : { basis: 'missing', sourceField: null };
  }
  return { values, provenance };
}

function sumPresent(values, fields) {
  const present = fields.filter((field) => values[field] !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, field) => sum + values[field], 0);
}

function derive(values, provenance, field, amount, sourceFields, warnings, partial = false) {
  if (values[field] !== null || amount === null) return;
  values[field] = amount;
  provenance[field] = {
    basis: partial ? 'derived-from-partial-lines' : 'derived',
    sourceFields,
  };
  if (partial) {
    warnings.push({
      code: 'partial_total',
      field,
      message: `${field} was derived from supplied line items; omitted lines are treated as zero.`,
    });
  }
}

function normalizeCurrency(input, warnings) {
  const raw = String(input.currency || input.balanceSheet?.currency || input.incomeStatement?.currency || '').trim().toUpperCase();
  if (!raw) {
    warnings.push({
      code: 'currency_missing',
      field: 'currency',
      message: 'Currency was not supplied. Values remain unconverted.',
    });
    return 'UNSPECIFIED';
  }
  if (!/^[A-Z]{3}$/.test(raw)) {
    warnings.push({
      code: 'currency_invalid',
      field: 'currency',
      message: 'Currency should be a three-letter ISO code such as THB, USD, or EUR.',
    });
    return 'UNSPECIFIED';
  }
  return raw;
}

function ratio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return round(numerator / denominator);
}

function percent(numerator, denominator) {
  const value = ratio(numerator, denominator);
  return value === null ? null : round(value * 100);
}

function metric(value, formula, inputs, quality = 'reported-or-derived', note = null) {
  return { value, formula, inputs, quality, note };
}

function metricStatus(value, redBelow, amberBelow) {
  if (value === null) return 'unknown';
  if (value < redBelow) return 'red';
  if (value < amberBelow) return 'amber';
  return 'green';
}

function formatAmount(value, currency) {
  if (!Number.isFinite(value)) return 'unknown';
  const prefix = currency === 'UNSPECIFIED' ? '' : `${currency} `;
  return `${prefix}${Math.round(value).toLocaleString('en-US')}`;
}

function calculateAltman(values, modelId, warnings) {
  if (!modelId) {
    return {
      value: null,
      zone: 'Not assessed',
      model: null,
      formula: null,
      note: 'Select an Altman model only after confirming whether the company is manufacturing or non-manufacturing.',
    };
  }
  const model = ALTMAN_MODELS[modelId];
  if (!model) {
    warnings.push({
      code: 'altman_model_invalid',
      field: 'analysisOptions.altmanModel',
      message: `Unsupported Altman model: ${modelId}.`,
    });
    return {
      value: null,
      zone: 'Not assessed',
      model: modelId,
      formula: null,
      note: 'The requested Altman model is unsupported.',
    };
  }

  const required = ['workingCapital', 'retainedEarnings', 'operatingIncome', 'totalAssets', 'equity', 'totalLiabilities'];
  if (modelId === 'private-manufacturing') required.push('revenue');
  const missing = required.filter((field) => values[field] === null);
  if (missing.length > 0 || values.totalAssets <= 0 || values.totalLiabilities <= 0) {
    return {
      value: null,
      zone: 'Not assessed',
      model: modelId,
      formula: model.formula,
      missing,
      note: values.totalLiabilities === 0
        ? 'Zero liabilities makes Equity/Total Liabilities undefined; no artificial cap is applied.'
        : 'The selected model is missing required inputs.',
    };
  }

  const x1 = values.workingCapital / values.totalAssets;
  const x2 = values.retainedEarnings / values.totalAssets;
  const x3 = values.operatingIncome / values.totalAssets;
  const x4 = values.equity / values.totalLiabilities;
  const x5 = values.revenue / values.totalAssets;
  const score = modelId === 'private-manufacturing'
    ? 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5
    : 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
  const rounded = round(score);
  const zone = rounded < model.distress ? 'Distress' : rounded < model.safe ? 'Grey' : 'Safe';
  return {
    value: rounded,
    zone,
    model: modelId,
    label: model.label,
    formula: model.formula,
    thresholds: { distressBelow: model.distress, safeAtOrAbove: model.safe },
    note: 'Bankruptcy-risk screen, not a probability of failure or an investment recommendation.',
  };
}

function buildDecision(values, dataQuality, ratios, currency) {
  const positives = [];
  const risks = [];
  const needs = [];
  const questions = [];

  if (dataQuality.missingCore.length > 0) {
    needs.push({
      priority: 'P0',
      title: 'Complete the accounting equation',
      action: `Provide ${dataQuality.missingCore.join(', ')} so assets, liabilities, and equity can be reconciled without assumptions.`,
    });
  }

  if (dataQuality.balanceCheck.status === 'failed') {
    risks.push({
      claim: 'The statement does not balance.',
      evidence: `Assets differ from liabilities plus equity by ${formatAmount(Math.abs(dataQuality.balanceCheck.residual), currency)}.`,
    });
    needs.push({
      priority: 'P0',
      title: 'Reconcile the balance sheet',
      action: 'Correct classifications or missing lines before using any solvency or investability conclusion.',
    });
  }

  if (values.equity !== null && values.equity < 0) {
    risks.push({
      claim: 'Reported equity is negative.',
      evidence: `Equity is ${formatAmount(values.equity, currency)} under Assets − Liabilities.`,
    });
    needs.push({
      priority: 'P1',
      title: 'Repair the capital deficit',
      action: `Restore at least ${formatAmount(Math.abs(values.equity), currency)} through retained earnings, new equity, liability conversion, or verified asset recovery before distributions.`,
    });
  } else if (values.equity !== null) {
    positives.push({
      claim: 'Reported book equity is positive.',
      evidence: `${formatAmount(values.equity, currency)} remains after reported liabilities.`,
    });
  }

  if (ratios.currentRatio !== null) {
    if (ratios.currentRatio < 1) {
      risks.push({
        claim: 'Short-term obligations exceed current assets.',
        evidence: `Current ratio is ${ratios.currentRatio}× and working capital is ${formatAmount(values.workingCapital, currency)}.`,
      });
      const targetCurrentAssets = values.totalCurrentLiabilities * 1.2;
      needs.push({
        priority: 'P1',
        title: 'Restore a 1.2× liquidity buffer',
        action: `Add, retain, or refinance approximately ${formatAmount(Math.max(0, targetCurrentAssets - values.totalCurrentAssets), currency)} of current funding.`,
      });
    } else {
      positives.push({
        claim: 'Reported current assets cover current liabilities.',
        evidence: `Current ratio is ${ratios.currentRatio}×.`,
      });
    }
  }

  if (ratios.liabilitiesToAssets !== null && ratios.liabilitiesToAssets > 0.75) {
    risks.push({
      claim: 'Creditors fund most reported assets.',
      evidence: `Liabilities equal ${round(ratios.liabilitiesToAssets * 100)}% of assets.`,
    });
  }

  if (values.netProfit !== null) {
    if (values.netProfit > 0) {
      positives.push({
        claim: 'The supplied period is profitable.',
        evidence: `Net profit is ${formatAmount(values.netProfit, currency)}.`,
      });
    } else {
      risks.push({
        claim: 'The supplied period is loss-making.',
        evidence: `Net result is ${formatAmount(values.netProfit, currency)}.`,
      });
      needs.push({
        priority: 'P1',
        title: 'Prove a path to operating break-even',
        action: values.operatingIncome !== null && values.operatingIncome < 0
          ? `Close an operating-income gap of ${formatAmount(Math.abs(values.operatingIncome), currency)} through documented gross-profit growth or cost reduction.`
          : 'Provide a bridge from the current loss to positive operating cash flow.',
      });
    }
  }

  if (!dataQuality.hasIncomeStatement) {
    needs.push({
      priority: 'P1',
      title: 'Add a same-period income statement',
      action: 'Provide revenue, operating income or EBIT, and net profit before judging earnings quality or investment return.',
    });
    questions.push('Provide revenue, EBIT or operating income, and net profit for the same period.');
  }
  questions.push('Provide operating cash flow and debt service to test cash conversion and coverage.');
  questions.push('Provide at least two comparative periods to test direction, volatility, and one-off items.');
  questions.push('Provide ownership, customer concentration, contingent liabilities, and proposed deal terms before an investment decision.');

  let state = 'conditional';
  let verdict = 'Balance-sheet screen only';
  let classification = 'Earnings and cash flow unproven';
  let color = 'amber';

  if (!dataQuality.isUsable) {
    state = 'unassessable';
    verdict = 'Not assessable from the supplied statement';
    classification = 'Repair or complete the evidence';
    color = 'red';
  } else if (values.equity < 0 || (ratios.currentRatio !== null && ratios.currentRatio < 0.8)) {
    state = 'distressed';
    verdict = 'Financial distress screen triggered';
    classification = 'Recapitalization or restructuring case';
    color = 'red';
  } else if (!dataQuality.hasIncomeStatement) {
    state = 'conditional';
    verdict = 'Solvent on the reported balance sheet';
    classification = 'Investment return not assessable without earnings and cash flow';
  } else if (
    values.netProfit > 0
    && (ratios.currentRatio === null || ratios.currentRatio >= 1.2)
    && (ratios.liabilitiesToAssets === null || ratios.liabilitiesToAssets <= 0.6)
  ) {
    state = 'passes-first-screen';
    verdict = 'Passes the first financial screen';
    classification = 'Proceed to cash flow, valuation, governance, and deal-term diligence';
    color = 'green';
  } else {
    verdict = 'Mixed financial condition';
    classification = 'Proceed only with milestones and evidence gates';
  }

  return {
    state,
    verdict,
    classification,
    color,
    positives,
    risks,
    needs,
    questions,
    disclaimer: 'Screening analysis only. It is not investment, lending, accounting, or legal advice.',
  };
}

export function evaluateBalanceSheetPayload(input = {}) {
  const errors = [];
  const warnings = [];
  const bsSource = input.balanceSheet && typeof input.balanceSheet === 'object' ? input.balanceSheet : input;
  const isSource = input.incomeStatement && typeof input.incomeStatement === 'object' ? input.incomeStatement : input;
  const balance = readFields(bsSource || {}, BALANCE_ALIASES, errors);
  const income = readFields(isSource || {}, INCOME_ALIASES, errors);
  const values = { ...balance.values, ...income.values };
  const provenance = { ...balance.provenance, ...income.provenance };
  const currency = normalizeCurrency(input, warnings);

  const currentAssetFields = ['cash', 'accountsReceivable', 'inventory', 'otherCurrentAssets'];
  const currentLiabilityFields = ['accountsPayable', 'shortTermDebt', 'otherCurrentLiabilities'];
  const currentAssetsSum = sumPresent(values, currentAssetFields);
  const currentLiabilitiesSum = sumPresent(values, currentLiabilityFields);
  derive(values, provenance, 'totalCurrentAssets', currentAssetsSum, currentAssetFields, warnings, true);
  derive(values, provenance, 'totalCurrentLiabilities', currentLiabilitiesSum, currentLiabilityFields, warnings, true);

  const nonCurrentAssetLines = ['fixedAssets', 'otherNonCurrentAssets'];
  const nonCurrentLiabilityLines = ['longTermDebt', 'otherNonCurrentLiabilities'];
  const nonCurrentAssets = sumPresent(values, nonCurrentAssetLines);
  const nonCurrentLiabilities = sumPresent(values, nonCurrentLiabilityLines);
  if (values.totalCurrentAssets !== null && nonCurrentAssets !== null) {
    derive(values, provenance, 'totalAssets', values.totalCurrentAssets + nonCurrentAssets, ['totalCurrentAssets', ...nonCurrentAssetLines], warnings);
  }
  if (values.totalCurrentLiabilities !== null) {
    derive(
      values,
      provenance,
      'totalLiabilities',
      values.totalCurrentLiabilities + (nonCurrentLiabilities || 0),
      ['totalCurrentLiabilities', ...nonCurrentLiabilityLines],
      warnings,
      nonCurrentLiabilities === null,
    );
  }
  if (values.paidInCapital !== null && values.retainedEarnings !== null) {
    derive(values, provenance, 'equity', values.paidInCapital + values.retainedEarnings, ['paidInCapital', 'retainedEarnings'], warnings);
  }

  const totalsReported = {
    totalAssets: provenance.totalAssets.basis === 'reported',
    totalLiabilities: provenance.totalLiabilities.basis === 'reported',
    equity: provenance.equity.basis === 'reported',
  };
  if (values.totalAssets !== null && values.totalLiabilities !== null && values.equity === null) {
    derive(values, provenance, 'equity', values.totalAssets - values.totalLiabilities, ['totalAssets', 'totalLiabilities'], warnings);
  } else if (values.totalAssets !== null && values.equity !== null && values.totalLiabilities === null) {
    derive(values, provenance, 'totalLiabilities', values.totalAssets - values.equity, ['totalAssets', 'equity'], warnings);
  } else if (values.totalLiabilities !== null && values.equity !== null && values.totalAssets === null) {
    derive(values, provenance, 'totalAssets', values.totalLiabilities + values.equity, ['totalLiabilities', 'equity'], warnings);
  }

  if (values.grossProfit === null && values.revenue !== null && values.operatingExpenses !== null && values.operatingIncome !== null) {
    derive(values, provenance, 'grossProfit', values.operatingIncome + values.operatingExpenses, ['operatingIncome', 'operatingExpenses'], warnings);
  }
  if (values.operatingIncome === null && values.grossProfit !== null && values.operatingExpenses !== null) {
    derive(values, provenance, 'operatingIncome', values.grossProfit - values.operatingExpenses, ['grossProfit', 'operatingExpenses'], warnings);
  }
  if (values.netProfit === null && values.operatingIncome !== null && values.interestExpense !== null) {
    derive(values, provenance, 'netProfit', values.operatingIncome - values.interestExpense, ['operatingIncome', 'interestExpense'], warnings);
  }

  for (const field of ['totalAssets', 'totalCurrentAssets', 'totalLiabilities', 'totalCurrentLiabilities']) {
    if (values[field] !== null && values[field] < 0) {
      errors.push({ code: 'negative_total', field, message: `${field} cannot be negative.` });
    }
  }
  if (values.totalAssets === 0) {
    errors.push({ code: 'zero_assets', field: 'totalAssets', message: 'totalAssets must be greater than zero.' });
  }

  const residual = values.totalAssets !== null && values.totalLiabilities !== null && values.equity !== null
    ? round(values.totalAssets - values.totalLiabilities - values.equity)
    : null;
  const tolerance = values.totalAssets === null ? null : Math.max(1, Math.abs(values.totalAssets) * 0.001);
  let balanceStatus = 'unavailable';
  if (residual !== null) {
    if (Math.abs(residual) > tolerance) balanceStatus = 'failed';
    else if (totalsReported.totalAssets && totalsReported.totalLiabilities && totalsReported.equity) balanceStatus = 'verified';
    else balanceStatus = 'derived';
  }

  const workingCapital = values.totalCurrentAssets !== null && values.totalCurrentLiabilities !== null
    ? values.totalCurrentAssets - values.totalCurrentLiabilities
    : null;
  values.workingCapital = workingCapital;
  const ratios = {
    currentRatio: ratio(values.totalCurrentAssets, values.totalCurrentLiabilities),
    quickRatio: ratio(
      values.cash !== null || values.accountsReceivable !== null
        ? (values.cash || 0) + (values.accountsReceivable || 0)
        : null,
      values.totalCurrentLiabilities,
    ),
    cashRatio: ratio(values.cash, values.totalCurrentLiabilities),
    liabilitiesToAssets: ratio(values.totalLiabilities, values.totalAssets),
    debtToEquity: values.equity > 0 ? ratio(values.totalLiabilities, values.equity) : null,
    grossMarginPct: percent(values.grossProfit, values.revenue),
    operatingMarginPct: percent(values.operatingIncome, values.revenue),
    netMarginPct: percent(values.netProfit, values.revenue),
    interestCoverage: ratio(values.operatingIncome, values.interestExpense),
    assetTurnover: ratio(values.revenue, values.totalAssets),
  };

  const requiredBalanceFields = ['totalAssets', 'totalLiabilities', 'equity'];
  const missingCore = requiredBalanceFields.filter((field) => values[field] === null);
  const hasIncomeStatement = ['revenue', 'operatingIncome', 'netProfit'].some((field) => values[field] !== null);
  const isUsable = errors.length === 0
    && missingCore.length === 0
    && balanceStatus !== 'failed'
    && values.totalAssets > 0;
  const reportedCount = Object.values(provenance).filter((item) => item.basis === 'reported').length;
  const possibleCount = Object.keys(provenance).length;
  const completenessPct = round((reportedCount / possibleCount) * 100);
  const confidence = !isUsable
    ? 'low'
    : balanceStatus === 'verified' && hasIncomeStatement && completenessPct >= 55
      ? 'high'
      : balanceStatus !== 'unavailable' && completenessPct >= 30
        ? 'medium'
        : 'low';
  const dataQuality = {
    isUsable,
    confidence,
    completenessPct,
    hasIncomeStatement,
    missingCore,
    errors,
    warnings,
    balanceCheck: {
      status: balanceStatus,
      formula: 'Total Assets − Total Liabilities − Total Equity = 0',
      residual,
      tolerance: tolerance === null ? null : round(tolerance),
      note: balanceStatus === 'derived'
        ? 'The equation reconciles using at least one derived total; it was not independently verified.'
        : null,
    },
  };

  const altman = calculateAltman(
    values,
    input.analysisOptions?.altmanModel || input.altmanModel || null,
    warnings,
  );
  const decision = buildDecision(values, dataQuality, ratios, currency);

  const metrics = {
    totalAssets: values.totalAssets,
    totalCurrentAssets: values.totalCurrentAssets,
    totalLiabilities: values.totalLiabilities,
    totalCurrentLiabilities: values.totalCurrentLiabilities,
    paidInCapital: values.paidInCapital,
    retainedEarnings: values.retainedEarnings,
    equity: values.equity,
    workingCapital,
    currentRatio: ratios.currentRatio,
    quickRatio: ratios.quickRatio,
    cashRatio: ratios.cashRatio,
    liabilitiesToAssets: ratios.liabilitiesToAssets,
    debtToEquity: ratios.debtToEquity,
    revenue: values.revenue,
    grossProfit: values.grossProfit,
    operatingExpenses: values.operatingExpenses,
    operatingIncome: values.operatingIncome,
    interestExpense: values.interestExpense,
    netProfit: values.netProfit,
    grossMarginPct: ratios.grossMarginPct,
    operatingMarginPct: ratios.operatingMarginPct,
    netMarginPct: ratios.netMarginPct,
    interestCoverage: ratios.interestCoverage,
    assetTurnover: ratios.assetTurnover,
    altmanZScore: altman.value,
    altmanZone: altman.zone,
    isNegativeEquity: values.equity !== null ? values.equity < 0 : null,
  };

  return {
    model: {
      name: 'Ikigai evidence-first financial diagnostic',
      version: FINANCIAL_DIAGNOSTIC_VERSION,
      conservationLaw: 'totalAssets = totalLiabilities + equity',
    },
    companyName: String(input.companyName || input.name || 'Target Company').trim().slice(0, 160),
    currency,
    periodEnding: input.periodEnding || bsSource.periodEnding || null,
    healthVerdict: decision.verdict,
    healthColor: decision.color,
    investabilityVerdict: decision.verdict,
    investabilityClassification: decision.classification,
    investabilitySummary: `${decision.verdict}. ${decision.classification}. Confidence: ${confidence}.`,
    decision,
    dataQuality,
    metrics,
    metricDetails: {
      workingCapital: metric(workingCapital, 'Total Current Assets − Total Current Liabilities', ['totalCurrentAssets', 'totalCurrentLiabilities']),
      currentRatio: {
        ...metric(ratios.currentRatio, 'Total Current Assets ÷ Total Current Liabilities', ['totalCurrentAssets', 'totalCurrentLiabilities']),
        status: metricStatus(ratios.currentRatio, 1, 1.2),
      },
      quickRatio: metric(ratios.quickRatio, '(Cash + Accounts Receivable) ÷ Total Current Liabilities', ['cash', 'accountsReceivable', 'totalCurrentLiabilities']),
      liabilitiesToAssets: metric(ratios.liabilitiesToAssets, 'Total Liabilities ÷ Total Assets', ['totalLiabilities', 'totalAssets']),
      debtToEquity: metric(
        ratios.debtToEquity,
        'Total Liabilities ÷ Positive Book Equity',
        ['totalLiabilities', 'equity'],
        values.equity > 0 ? 'reported-or-derived' : 'not-meaningful',
        values.equity <= 0 ? 'Debt-to-equity is not meaningful when equity is zero or negative.' : null,
      ),
      netMarginPct: metric(ratios.netMarginPct, 'Net Profit ÷ Revenue × 100', ['netProfit', 'revenue']),
      interestCoverage: metric(
        ratios.interestCoverage,
        'EBIT ÷ Interest Expense',
        ['operatingIncome', 'interestExpense'],
        values.interestExpense === 0 ? 'not-applicable' : 'reported-or-derived',
      ),
      altmanZScore: altman,
    },
    normalizedInput: {
      balanceSheet: Object.fromEntries(Object.keys(BALANCE_ALIASES).map((field) => [field, values[field]])),
      incomeStatement: Object.fromEntries(Object.keys(INCOME_ALIASES).map((field) => [field, values[field]])),
      provenance,
    },
    interventions: decision.needs,
    evaluatedAt: new Date().toISOString(),
  };
}
