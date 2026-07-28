import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOwner, parseOwnerEmails } from './owners.js';

test('parseOwnerEmails normalizes, deduplicates, and freezes deployment config', () => {
  const owners = parseOwnerEmails('owner@example.com, SECOND@example.com, owner@example.com');
  assert.deepEqual(owners, ['owner@example.com', 'second@example.com']);
  assert.equal(Object.isFrozen(owners), true);
});

test('isAllowedOwner is case-insensitive and trim-tolerant', () => {
  const configured = 'owner@example.com,second@example.com';
  assert.equal(isAllowedOwner(' OWNER@EXAMPLE.COM ', configured), true);
  assert.equal(isAllowedOwner('Second@Example.com', configured), true);
});

test('isAllowedOwner fails closed for unknown, blank, and unconfigured owners', () => {
  assert.equal(isAllowedOwner('someone@example.com', 'owner@example.com'), false);
  assert.equal(isAllowedOwner('owner@example.com', ''), false);
  assert.equal(isAllowedOwner(''), false);
  assert.equal(isAllowedOwner(null), false);
});
