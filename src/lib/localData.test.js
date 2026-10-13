import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseLocalSource, privateDataDir, readPrivateJson } from './localData.js';

const SYNTHETIC = [{ id: 'synthetic' }];
const BLANK = [];

test('chooseLocalSource uses the synthetic sample only when no private directory is set', () => {
  const unset = chooseLocalSource(false, { ok: false, reason: 'unset' }, { synthetic: SYNTHETIC, blank: BLANK });
  assert.equal(unset.mode, 'synthetic');
  assert.deepEqual(unset.value, SYNTHETIC);
  assert.equal(unset.privateStatus, null);

  const missing = chooseLocalSource(true, { ok: false, reason: 'missing' }, { synthetic: SYNTHETIC, blank: BLANK });
  assert.equal(missing.mode, 'private');
  assert.deepEqual(missing.value, BLANK);
  assert.equal(missing.privateStatus, 'missing');

  const loaded = chooseLocalSource(true, { ok: true, value: [{ id: 'private' }] }, { synthetic: SYNTHETIC, blank: BLANK });
  assert.equal(loaded.mode, 'private');
  assert.deepEqual(loaded.value, [{ id: 'private' }]);
  assert.equal(loaded.privateStatus, 'loaded');
});

test('readPrivateJson reads a file in IKIGAI_PRIVATE_DATA_DIR and does not invent one', async () => {
  const previous = process.env.IKIGAI_PRIVATE_DATA_DIR;
  const dir = await mkdtemp(join(tmpdir(), 'ikigai-private-'));
  try {
    delete process.env.IKIGAI_PRIVATE_DATA_DIR;
    assert.equal(privateDataDir(), null);
    assert.deepEqual(await readPrivateJson('evidence.json'), { ok: false, reason: 'unset' });

    process.env.IKIGAI_PRIVATE_DATA_DIR = dir;
    assert.equal(privateDataDir(), dir);
    assert.deepEqual(await readPrivateJson('evidence.json'), { ok: false, reason: 'missing' });
    assert.deepEqual(await readPrivateJson('not-allowed.json'), { ok: false, reason: 'invalid' });

    await writeFile(join(dir, 'evidence.json'), JSON.stringify({
      label: 'owner file',
      documents: [{ id: 'mine', amount: 1 }],
    }));
    const loaded = await readPrivateJson('evidence.json');
    assert.equal(loaded.ok, true);
    assert.equal(loaded.value.documents[0].id, 'mine');

    await writeFile(join(dir, 'finance-snapshot.json'), '{');
    assert.deepEqual(await readPrivateJson('finance-snapshot.json'), { ok: false, reason: 'invalid' });
  } finally {
    if (previous === undefined) delete process.env.IKIGAI_PRIVATE_DATA_DIR;
    else process.env.IKIGAI_PRIVATE_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
