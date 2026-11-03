import type { CredentialErrorPredicate } from '../requestId/CredentialErrorPredicate.js';
import type { RequestIdSelectionOptions } from '../requestId/RequestIdSelectionOptions.js';
import type { TimelineSource } from '../requestId/TimelineSource.js';

/**
 * Settings of the requestId phase of a session (§8.3).
 */
export interface DispatchRequestIdOptions {
  readonly source: TimelineSource;
  readonly selection: RequestIdSelectionOptions;
  readonly initialDelayMs: number;
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly isCredentialError: CredentialErrorPredicate;
}
