import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, verifySession, getSessionEmail } from './auth.js';

test('session round-trip verifies and rejects tampering', async () => {
  process.env.SESSION_SECRET = 'synthetic-test-secret-with-enough-entropy';
  const token = await createSession();
  const session = await verifySession(token);
  assert.ok(session);
  assert.ok(typeof session.exp === 'number');
  assert.equal(session.email, null);
  assert.equal(await verifySession(`${token.slice(0, -1)}x`), null);
});
