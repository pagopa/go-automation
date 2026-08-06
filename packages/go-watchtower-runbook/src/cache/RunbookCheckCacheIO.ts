import type { RunbookOutput } from '@go-automation/go-runbook';

import type { CachedRunbookOutput } from './CachedRunbookOutput.js';
import type { RunbookCheckCache } from './RunbookCheckCache.js';

/**
 * Reads a cache entry without allowing an adapter failure to affect the check.
 * A read error and a stale entry are both ordinary cache misses.
 */
export async function readFreshRunbookOutput(
  cache: RunbookCheckCache,
  key: string,
  expectedFingerprint: string,
): Promise<RunbookOutput | undefined> {
  try {
    const cached = await cache.get(key);
    return cached?.fingerprint === expectedFingerprint ? cached.output : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persists a cache entry on a best-effort basis. The runbook output is already
 * authoritative at this point, so an adapter failure must not replace it with
 * an execution error.
 */
export async function persistRunbookOutput(
  cache: RunbookCheckCache,
  key: string,
  value: CachedRunbookOutput,
): Promise<void> {
  try {
    await cache.set(key, value);
  } catch {
    return;
  }
}
