import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunbookOutput } from '@go-automation/go-runbook';

import type { CachedRunbookMeta } from '../CachedRunbookMeta.js';
import type { CachedRunbookOutput } from '../CachedRunbookOutput.js';
import type { RunbookCheckCache } from '../RunbookCheckCache.js';
import { persistRunbookOutput, readFreshRunbookOutput } from '../RunbookCheckCacheIO.js';

const output = { schemaVersion: '1.0.0' } as RunbookOutput;
const entry: CachedRunbookOutput = {
  fingerprint: 'current',
  savedAt: '2026-08-06T00:00:00.000Z',
  meta: {} as CachedRunbookMeta,
  output,
};

async function tick(): Promise<void> {
  await Promise.resolve();
}

describe('RunbookCheckCacheIO', () => {
  it('returns only an entry with the expected fingerprint', async () => {
    const cache: RunbookCheckCache = {
      get: async () => {
        await tick();
        return entry;
      },
      set: async () => await tick(),
    };

    assert.strictEqual(await readFreshRunbookOutput(cache, 'key', 'current'), output);
    assert.strictEqual(await readFreshRunbookOutput(cache, 'key', 'stale'), undefined);
  });

  it('treats an adapter read failure as a cache miss', async () => {
    const cache: RunbookCheckCache = {
      get: async () => {
        await tick();
        throw new Error('filesystem unavailable');
      },
      set: async () => await tick(),
    };

    assert.strictEqual(await readFreshRunbookOutput(cache, 'key', 'current'), undefined);
  });

  it('does not propagate an adapter write failure', async () => {
    let writes = 0;
    const cache: RunbookCheckCache = {
      get: async () => {
        await tick();
        return undefined;
      },
      set: async () => {
        await tick();
        writes += 1;
        throw new Error('disk full');
      },
    };

    await assert.doesNotReject(async () => await persistRunbookOutput(cache, 'key', entry));
    assert.strictEqual(writes, 1);
  });
});
