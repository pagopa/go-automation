/**
 * Known cases for the pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm runbook.
 */

import { lambda } from '../framework.js';
import type { KnownCase } from '../framework.js';

export const KNOWN_CASES: ReadonlyArray<KnownCase> = [
  ...lambda.LAMBDA_RUNTIME_KNOWN_CASES,
  // add alarm-specific cases here
];
