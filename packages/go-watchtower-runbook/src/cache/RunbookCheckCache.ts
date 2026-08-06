import type { CachedRunbookOutput } from './CachedRunbookOutput.js';

/**
 * Storage port for the per-occurrence resume cache.
 *
 * The library owns the staleness policy (it compares the stored fingerprint with
 * the recomputed one); an adapter only stores and retrieves envelopes, so the
 * filesystem/GOScript implementation stays in the CLI.
 */
export interface RunbookCheckCache {
  get(key: string): Promise<CachedRunbookOutput | undefined>;
  set(key: string, value: CachedRunbookOutput): Promise<void>;
}

/**
 * Builds the cache key of one occurrence.
 *
 * Adapters must treat it as opaque and map it to their own storage layout: the
 * library never assumes a filesystem path.
 *
 * @param alarmName - Alarm name, which equals the runbook id
 * @param eventId - Occurrence identifier
 * @returns The occurrence cache key
 */
export function runbookCheckCacheKey(alarmName: string, eventId: string): string {
  return `${alarmName}/${eventId}`;
}
