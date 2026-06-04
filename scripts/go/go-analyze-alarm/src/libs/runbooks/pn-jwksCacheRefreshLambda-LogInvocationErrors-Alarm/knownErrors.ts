/**
 * Downstream error patterns for the pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm runbook.
 *
 * The PDF only reports external JWKS endpoint failures. Those are handled as
 * known cases in knownCases.ts, not as downstream microservice routing rules.
 */
import type { lambda } from '@go-automation/go-runbook';

export const DOWNSTREAM_ERROR_PATTERNS: ReadonlyArray<lambda.DownstreamErrorPattern> = [];
