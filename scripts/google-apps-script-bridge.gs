/**
 * Ikigai Finance Community · Google Sheets bridge
 *
 * Bound-script setup:
 * 1. Paste this file into Extensions → Apps Script for the company workbook.
 * 2. Run setupIkigaiFinance() once and answer the two prompts.
 * 3. Deploy as a web app that executes as you. Anonymous access is acceptable
 *    only because every POST is rejected without the shared sync secret.
 * 4. Set the deployment URL as GOOGLE_SHEETS_APP_URL in the dashboard.
 *
 * @OnlyCurrentDoc
 */

var IKIGAI_VERSION = '1.0.0';
var PROFILE_SHEET = 'Company Profile';
var BALANCE_SHEET = 'Balance Sheet';
var INCOME_SHEET = 'Income Statement';
var DASHBOARD_PATH = '/api/sheets/sync';

var BALANCE_ROWS = [
  ['cash', 'Cash'],
  ['accountsReceivable', 'Accounts receivable'],
  ['inventory', 'Inventory'],
  ['otherCurrentAssets', 'Other current assets'],
  ['totalCurrentAssets', 'Total current assets'],
  ['fixedAssets', 'Property, plant and equipment'],
  ['otherNonCurrentAssets', 'Other non-current assets'],
  ['totalAssets', 'Total assets'],
  ['accountsPayable', 'Accounts payable'],
  ['shortTermDebt', 'Short-term debt'],
  ['otherCurrentLiabilities', 'Other current liabilities'],
  ['totalCurrentLiabilities', 'Total current liabilities'],
  ['longTermDebt', 'Long-term debt'],
  ['otherNonCurrentLiabilities', 'Other non-current liabilities'],
  ['totalLiabilities', 'Total liabilities'],
  ['paidInCapital', 'Paid-in capital'],
  ['retainedEarnings', 'Retained earnings / accumulated loss'],
  ['equity', 'Total equity']
];

var INCOME_ROWS = [
  ['revenue', 'Revenue'],
  ['grossProfit', 'Gross profit'],
  ['operatingExpenses', 'Operating expenses'],
  ['operatingIncome', 'Operating income / EBIT'],
  ['interestExpense', 'Interest expense'],
  ['depreciation', 'Depreciation'],
  ['netProfit', 'Net profit / loss']
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Ikigai Finance')
    .addItem('Setup connection', 'setupIkigaiFinance')
    .addItem('Push to dashboard now', 'pushFinanceToDashboard')
    .addItem('Rebuild missing rows', 'ensureIkigaiSheets')
    .addToUi();
}

function setupIkigaiFinance() {
  var ui = SpreadsheetApp.getUi();
  var dashboardPrompt = ui.prompt(
    'Ikigai dashboard URL',
    'Enter the deployed dashboard origin, for example https://finance.example.com',
    ui.ButtonSet.OK_CANCEL
  );
  if (dashboardPrompt.getSelectedButton() !== ui.Button.OK) return;

  var secretPrompt = ui.prompt(
    'Shared sync secret',
    'Enter the same long random value stored as GOOGLE_SHEETS_SYNC_SECRET in the dashboard.',
    ui.ButtonSet.OK_CANCEL
  );
  if (secretPrompt.getSelectedButton() !== ui.Button.OK) return;

  var dashboardUrl = normalizeDashboardUrl_(dashboardPrompt.getResponseText());
  var secret = String(secretPrompt.getResponseText() || '').trim();
  if (!dashboardUrl || secret.length < 24) {
    ui.alert('Setup stopped. Use an https:// dashboard URL and a sync secret of at least 24 characters.');
    return;
  }

  PropertiesService.getScriptProperties().setProperties({
    IKIGAI_DASHBOARD_URL: dashboardUrl,
    IKIGAI_SYNC_SECRET: secret,
    IKIGAI_BASE_REVISION: '0',
    IKIGAI_VERSION: IKIGAI_VERSION
  });
  ensureIkigaiSheets();
  installIkigaiTriggers_();
  ui.alert('Ikigai Finance is connected. Deploy this script as a web app, then put that web-app URL in GOOGLE_SHEETS_APP_URL.');
}

function normalizeDashboardUrl_(value) {
  var url = String(value || '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^/]+/i.test(url) ? url : '';
}

function installIkigaiTriggers_() {
  var handlers = { installedIkigaiEdit_: true, scheduledIkigaiPush_: true };
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (handlers[trigger.getHandlerFunction()]) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('installedIkigaiEdit_')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  ScriptApp.newTrigger('scheduledIkigaiPush_')
    .timeBased()
    .everyMinutes(10)
    .create();
}

function ensureIkigaiSheets() {
  ensureKeyValueSheet_(
    PROFILE_SHEET,
    [
      ['companyName', 'Company name'],
      ['currency', 'Currency (ISO code)'],
      ['periodEnding', 'Period ending (YYYY-MM-DD)'],
      ['sheetUrl', 'Google Sheet URL'],
      ['altmanModel', 'Altman model'],
      ['dashboardLocked', 'Dashboard locked'],
      ['revision', 'Dashboard revision'],
      ['lastSyncStatus', 'Last sync status'],
      ['lastSyncedAt', 'Last synced at']
    ],
    {
      companyName: 'My Company',
      currency: 'USD',
      sheetUrl: SpreadsheetApp.getActive().getUrl(),
      dashboardLocked: false,
      revision: 0
    }
  );
  ensureKeyValueSheet_(BALANCE_SHEET, BALANCE_ROWS, {});
  ensureKeyValueSheet_(INCOME_SHEET, INCOME_ROWS, {});
}

function ensureKeyValueSheet_(name, rows, defaults) {
  var workbook = SpreadsheetApp.getActive();
  var sheet = workbook.getSheetByName(name) || workbook.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Line item', 'Value']]);
    sheet.setFrozenRows(1);
  }
  var existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function(row) {
      existing[String(row[0] || '').trim()] = true;
    });
  }
  var additions = rows.filter(function(row) { return !existing[row[0]]; }).map(function(row) {
    return [row[0], row[1], defaults[row[0]] !== undefined ? defaults[row[0]] : ''];
  });
  if (additions.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, additions.length, 3).setValues(additions);
  }
  sheet.hideColumns(1);
  sheet.autoResizeColumn(2);
  sheet.setColumnWidth(3, 180);
}

function installedIkigaiEdit_(event) {
  if (!event || !event.range) return;
  var name = event.range.getSheet().getName();
  if ([PROFILE_SHEET, BALANCE_SHEET, INCOME_SHEET].indexOf(name) === -1) return;
  if (readProfileValue_('dashboardLocked') === true) {
    SpreadsheetApp.getActive().toast('Dashboard is locked. Unlock it before syncing edits.', 'Ikigai Finance', 5);
    return;
  }
  pushFinanceToDashboard();
}

function scheduledIkigaiPush_() {
  if (readProfileValue_('dashboardLocked') === true) return;
  pushFinanceToDashboard();
}

function pushFinanceToDashboard() {
  var properties = PropertiesService.getScriptProperties();
  var dashboardUrl = properties.getProperty('IKIGAI_DASHBOARD_URL');
  var secret = properties.getProperty('IKIGAI_SYNC_SECRET');
  if (!dashboardUrl || !secret) throw new Error('Run setupIkigaiFinance() first.');

  var payload = exportFinancePayload_();
  var response = UrlFetchApp.fetch(dashboardUrl + DASHBOARD_PATH, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + secret },
    payload: JSON.stringify({
      action: 'push_snapshot',
      baseRevision: Number(properties.getProperty('IKIGAI_BASE_REVISION') || 0) || null,
      payload: payload
    }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var result;
  try {
    result = JSON.parse(response.getContentText());
  } catch (error) {
    result = { status: 'error', error: 'Dashboard returned unreadable JSON.' };
  }
  writeProfileValue_('lastSyncStatus', result.status + (result.error ? ': ' + result.error : ''));
  writeProfileValue_('lastSyncedAt', new Date().toISOString());
  if (code >= 200 && code < 300 && result.status === 'ok') {
    properties.setProperty('IKIGAI_BASE_REVISION', String(result.revision));
    writeProfileValue_('revision', result.revision);
    SpreadsheetApp.getActive().toast('Financial model synced to dashboard.', 'Ikigai Finance', 3);
    return result;
  }
  throw new Error(result.error || 'Dashboard sync failed with HTTP ' + code + '.');
}

function exportFinancePayload_() {
  var profile = readKeyValueSheet_(PROFILE_SHEET);
  return {
    companyName: profile.companyName || 'My Company',
    currency: profile.currency || 'USD',
    periodEnding: profile.periodEnding || '',
    sheetUrl: SpreadsheetApp.getActive().getUrl(),
    analysisOptions: { altmanModel: profile.altmanModel || '' },
    balanceSheet: readKeyValueSheet_(BALANCE_SHEET),
    incomeStatement: readKeyValueSheet_(INCOME_SHEET)
  };
}

function readKeyValueSheet_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return {};
  var result = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(function(row) {
    var key = String(row[0] || '').trim();
    if (key) result[key] = row[2];
  });
  return result;
}

function readProfileValue_(key) {
  return readKeyValueSheet_(PROFILE_SHEET)[key];
}

function writeProfileValue_(key, value) {
  writeKeyValue_(PROFILE_SHEET, key, value);
}

function writeKeyValue_(sheetName, key, value) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;
  var keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var index = 0; index < keys.length; index += 1) {
    if (String(keys[index][0]) === key) {
      sheet.getRange(index + 2, 3).setValue(value === null || value === undefined ? '' : value);
      return;
    }
  }
}

function doPost(event) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return jsonResponse_({ status: 'error', error: 'Sheet is busy.' });
  try {
    var body = JSON.parse(event && event.postData ? event.postData.contents : '{}');
    var expected = PropertiesService.getScriptProperties().getProperty('IKIGAI_SYNC_SECRET');
    if (!expected || String(body.secret || '') !== expected) {
      return jsonResponse_({ status: 'error', error: 'Unauthorized.' });
    }
    if (body.action !== 'apply_snapshot' || !body.snapshot || !body.snapshot.payload) {
      return jsonResponse_({ status: 'error', error: 'apply_snapshot payload required.' });
    }
    ensureIkigaiSheets();
    applySnapshot_(body.snapshot);
    return jsonResponse_({ status: 'ok', revision: body.snapshot.revision });
  } catch (error) {
    return jsonResponse_({ status: 'error', error: error.message || String(error) });
  } finally {
    lock.releaseLock();
  }
}

function applySnapshot_(snapshot) {
  var payload = snapshot.payload;
  writeProfileValue_('companyName', payload.companyName || 'My Company');
  writeProfileValue_('currency', payload.currency || 'USD');
  writeProfileValue_('periodEnding', payload.periodEnding || '');
  writeProfileValue_('sheetUrl', SpreadsheetApp.getActive().getUrl());
  writeProfileValue_('altmanModel', payload.analysisOptions ? payload.analysisOptions.altmanModel || '' : '');
  writeProfileValue_('dashboardLocked', Boolean(snapshot.locked));
  writeProfileValue_('revision', snapshot.revision || 0);
  writeProfileValue_('lastSyncStatus', 'synced from dashboard');
  writeProfileValue_('lastSyncedAt', snapshot.updatedAt || new Date().toISOString());
  Object.keys(payload.balanceSheet || {}).forEach(function(key) {
    writeKeyValue_(BALANCE_SHEET, key, payload.balanceSheet[key]);
  });
  Object.keys(payload.incomeStatement || {}).forEach(function(key) {
    writeKeyValue_(INCOME_SHEET, key, payload.incomeStatement[key]);
  });
  PropertiesService.getScriptProperties().setProperty(
    'IKIGAI_BASE_REVISION',
    String(snapshot.revision || 0)
  );
  SpreadsheetApp.flush();
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
