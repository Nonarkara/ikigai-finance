import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedGoogleAppsScriptUrl } from './sheetsBridge.js';

test('Google Sheets outbound sync only permits Apps Script HTTPS hosts', () => {
  assert.equal(isAllowedGoogleAppsScriptUrl('https://script.google.com/macros/s/example/exec'), true);
  assert.equal(isAllowedGoogleAppsScriptUrl('https://script.googleusercontent.com/macros/echo'), true);
  assert.equal(isAllowedGoogleAppsScriptUrl('http://script.google.com/macros/s/example/exec'), false);
  assert.equal(isAllowedGoogleAppsScriptUrl('https://example.com/collect'), false);
  assert.equal(isAllowedGoogleAppsScriptUrl('not a url'), false);
});
