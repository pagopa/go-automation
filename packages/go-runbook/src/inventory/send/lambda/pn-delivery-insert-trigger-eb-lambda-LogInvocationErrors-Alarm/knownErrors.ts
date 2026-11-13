/**
 * Downstream error patterns for the pn-delivery-insert-trigger-eb-lambda-LogInvocationErrors-Alarm runbook.
 *
 * No downstream microservices are involved (see knownServices.ts), so there
 * are no routing patterns.
 */
import type { lambda } from '../../../../toolkits/send/index.js';

export const DOWNSTREAM_ERROR_PATTERNS: ReadonlyArray<lambda.DownstreamErrorPattern> = [];
