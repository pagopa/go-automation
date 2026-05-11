import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import { extractCwField } from './extractCwField.js';
import type { NextServiceInvocation } from './NextServiceInvocation.js';

/** Compiled patterns for service invocation detection. */
const INVOCATION_PATTERN = /Invoking external service ([\w-]+)/;
const TRACE_ID_PATTERN = /AWS-XRAY-TRACE-ID[:\s]+([^\s,]+)/;
const URL_PATTERN = /http:\/\/alb\.([\w-]+)\.pn\.internal/;

/**
 * Finds the next microservice invocation in the given log result rows.
 *
 * Detects two complementary patterns:
 * 1. Application log lines like `Invoking external service <name>` which
 *    carry an explicit service name and an `AWS-XRAY-TRACE-ID` token.
 * 2. URL log lines of the form `http://alb.<service>.pn.internal` which
 *    expose the downstream service in the host name.
 *
 * Returns the first match encountered, or `undefined` if none of the
 * patterns is found.
 *
 * @param results - CloudWatch Logs Insights result rows
 * @returns The next service invocation info, or `undefined`
 */
export function findNextServiceInvocation(results: ReadonlyArray<ResultField[]>): NextServiceInvocation | undefined {
  for (const row of results) {
    const message = extractCwField(row, 'message') ?? extractCwField(row, '@message') ?? '';
    if (message === '') {
      continue;
    }

    const invocationMatch = INVOCATION_PATTERN.exec(message);
    if (invocationMatch?.[1] !== undefined) {
      const traceIdMatch = TRACE_ID_PATTERN.exec(message);
      if (traceIdMatch?.[1] !== undefined) {
        return { service: invocationMatch[1], traceId: traceIdMatch[1] };
      }
    }

    const urlMatch = URL_PATTERN.exec(message);
    if (urlMatch?.[1] !== undefined) {
      const traceIdMatch = TRACE_ID_PATTERN.exec(message);
      if (traceIdMatch?.[1] !== undefined) {
        return { service: `pn-${urlMatch[1]}`, traceId: traceIdMatch[1] };
      }
    }
  }

  return undefined;
}
