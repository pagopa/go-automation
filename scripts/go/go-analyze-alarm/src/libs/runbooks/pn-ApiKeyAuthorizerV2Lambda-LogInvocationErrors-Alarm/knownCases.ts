/**
 * Known cases for the pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm runbook.
 */

import { lambda } from '@go-automation/go-runbook';
import type { KnownCase } from '@go-automation/go-runbook';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  // add alarm-specific cases here
];
