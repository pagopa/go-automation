/**
 * Downstream error patterns for the pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm runbook.
 *
 * The document lists pn-stream among the involved services. No correlated
 * downstream log query is defined in the procedure, so the target is used as
 * classification metadata only (see knownServices.ts: no logGroup).
 */
import type { lambda } from '@go-automation/go-runbook';

export const DOWNSTREAM_ERROR_PATTERNS: ReadonlyArray<lambda.DownstreamErrorPattern> = [
  {
    pattern: 'Error in get key[\\s\\S]*AxiosError:\\s*read ECONNRESET',
    target: 'pn-stream',
    description: 'Errore di connessione durante il recupero della key da pn-stream.',
  },
];
