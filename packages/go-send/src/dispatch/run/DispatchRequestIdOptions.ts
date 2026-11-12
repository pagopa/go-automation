import type { RequestIdStageOptions } from '../requestId/RequestIdStageOptions.js';

/**
 * Settings of the requestId phase of a session (§8.3): the options of the
 * requestId stage the script resolves. Ledger, clock and stop signal are
 * wired by the session.
 */
export type DispatchRequestIdOptions = Required<
  Pick<
    RequestIdStageOptions,
    'source' | 'selection' | 'initialDelayMs' | 'timeoutMs' | 'concurrency' | 'isCredentialError'
  >
>;
