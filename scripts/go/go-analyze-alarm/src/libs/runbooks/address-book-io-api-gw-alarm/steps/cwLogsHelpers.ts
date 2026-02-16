/**
 * Helper functions for parsing CloudWatch Logs Insights results.
 *
 * CloudWatch Logs Insights returns results as `ResultField[][]`,
 * where each row is an array of `{ field, value }` objects.
 * These helpers provide field extraction, error analysis, and
 * service invocation detection.
 */

import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';

/**
 * Extracts a field value from a CloudWatch Logs result row.
 *
 * @param row - A single result row (array of ResultField)
 * @param fieldName - The field name to look for
 * @returns The field value, or undefined if not found
 */
export function extractCwField(row: ReadonlyArray<ResultField>, fieldName: string): string | undefined {
  const field = row.find((f) => f.field === fieldName);
  return field?.value ?? undefined;
}

/**
 * Extracts the X-Ray Trace ID from an API Gateway log row.
 * The xrayTraceId field typically has the format `Root=<traceId>`.
 *
 * @param row - API Gateway log result row
 * @returns The extracted trace ID, or undefined
 */
export function extractXRayTraceId(row: ReadonlyArray<ResultField>): string | undefined {
  const xrayField = extractCwField(row, 'xrayTraceId');
  if (xrayField === undefined) {
    return undefined;
  }

  const match = /Root=([^\s]+)/.exec(xrayField);
  return match?.[1] ?? xrayField;
}

/**
 * Finds the longest error message across all result rows.
 * Looks for rows with level containing 'error' or 'warn',
 * or messages containing 'Exception', 'Error', or 'failed'.
 *
 * @param results - CloudWatch Logs query results
 * @returns The longest error message found, or empty string
 */
export function findErrorMessage(results: ReadonlyArray<ResultField[]>): string {
  let errorMessage = '';

  for (const row of results) {
    const message = extractCwField(row, 'message') ?? extractCwField(row, '@message') ?? '';
    const level = extractCwField(row, 'level') ?? '';

    const isErrorLevel = level.toLowerCase().includes('error') || level.toLowerCase().includes('warn');
    const hasErrorKeywords = message.includes('Exception') || message.includes('Error') || message.includes('failed');

    if ((isErrorLevel || hasErrorKeywords) && message.length > errorMessage.length) {
      errorMessage = message;
    }
  }

  return errorMessage;
}

/** Result of a next service invocation search */
export interface NextServiceInvocation {
  readonly service: string;
  readonly traceId: string;
}

/** Compiled patterns for service invocation detection */
const INVOCATION_PATTERN = /Invoking external service ([\w-]+)/;
const TRACE_ID_PATTERN = /AWS-XRAY-TRACE-ID[:\s]+([^\s,]+)/;
const URL_PATTERN = /http:\/\/alb\.([\w-]+)\.pn\.internal/;

/**
 * Finds the next service invocation in the log results.
 * Detects patterns like "Invoking external service <name>" and
 * URL patterns like "http://alb.<service>.pn.internal".
 *
 * @param results - CloudWatch Logs query results
 * @returns The next service invocation info, or undefined
 */
export function findNextServiceInvocation(results: ReadonlyArray<ResultField[]>): NextServiceInvocation | undefined {
  for (const row of results) {
    const message = extractCwField(row, 'message') ?? extractCwField(row, '@message') ?? '';
    if (message === '') {
      continue;
    }

    // Check "Invoking external service" pattern
    const invocationMatch = INVOCATION_PATTERN.exec(message);
    if (invocationMatch?.[1] !== undefined) {
      const traceIdMatch = TRACE_ID_PATTERN.exec(message);
      if (traceIdMatch?.[1] !== undefined) {
        return { service: invocationMatch[1], traceId: traceIdMatch[1] };
      }
    }

    // Check URL pattern (http://alb.<service>.pn.internal)
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
