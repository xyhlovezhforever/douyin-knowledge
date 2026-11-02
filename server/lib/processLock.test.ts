import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acquireProcessLock, processLockIsActive } from './processLock.js';

test('prevents a second process lock until the owner releases it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'douyin-lock-'));
  const lockPath = path.join(root, 'sync.lock');
  const first = await acquireProcessLock(lockPath);
  assert.ok(first);
  assert.equal(await processLockIsActive(lockPath), true);
  assert.equal(await acquireProcessLock(lockPath), null);
  await first.release();
  assert.equal(await processLockIsActive(lockPath), false);
  const next = await acquireProcessLock(lockPath);
  assert.ok(next);
  await next.release();
});

test('reclaims a stale process lock', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'douyin-lock-'));
  const lockPath = path.join(root, 'sync.lock');
  await writeFile(lockPath, JSON.stringify({ pid: 2147483647 }));
  const lock = await acquireProcessLock(lockPath);
  assert.ok(lock);
  await lock.release();
});
