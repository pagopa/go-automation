/**
 * Downstream error patterns for the pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm runbook.
 *
 * The document lists pn-stream among the involved services. No correlated
 * downstream log query is defined in the procedure, so the target is used as
 * classification metadata only (see knownServices.ts: no logGroup).
 */
import type { lambda } from '../../../../toolkits/send/index.js';

/** Connection reset while the key is read from pn-stream. */
export const GET_KEY_ECONNRESET_PATTERN = 'Error in get key[\\s\\S]*AxiosError:\\s*read ECONNRESET';

export const DOWNSTREAM_ERROR_PATTERNS: ReadonlyArray<lambda.DownstreamErrorPattern> = [
  {
    pattern: GET_KEY_ECONNRESET_PATTERN,
    target: 'pn-stream',
    description: 'Errore di connessione durante il recupero della key da pn-stream.',
  },
];
