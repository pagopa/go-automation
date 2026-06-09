import type { RunbookOutput } from '@go-automation/go-runbook';

import type { CachedRunbookMeta } from './CachedRunbookMeta.js';

/**
 * On-disk envelope for a cached runbook result: the {@link RunbookOutput} plus
 * the fingerprint (and its readable {@link CachedRunbookMeta}) used to decide
 * whether the entry is still valid on a later run.
 */
export interface CachedRunbookOutput {
  /** SHA-256 of {@link CachedRunbookMeta}; gates reuse on load. */
  readonly fingerprint: string;
  /** ISO timestamp of when the entry was written (informational). */
  readonly savedAt: string;
  /** Human-readable inputs behind {@link fingerprint}. */
  readonly meta: CachedRunbookMeta;
  /** The cached runbook output. */
  readonly output: RunbookOutput;
}
