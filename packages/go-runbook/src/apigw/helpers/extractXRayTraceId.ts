import type { ResultField } from '@aws-sdk/client-cloudwatch-logs';
import { extractCwField } from './extractCwField.js';

/** Compiled pattern for X-Ray trace id extraction (`Root=<value>`). */
const X_RAY_ROOT_PATTERN = /Root=([^\s]+)/;

/**
 * Extracts the X-Ray Trace ID from an API Gateway log row.
 *
 * The `xrayTraceId` field typically has the format `Root=<traceId>`. The
 * returned value preserves the AWS version prefix (e.g. `1-XXXX-YYYY`) as
 * required by CloudWatch Logs Insights `like` filtering on downstream
 * service logs.
 *
 * @param row - API Gateway log result row
 * @returns The extracted trace ID (with `1-` prefix), or `undefined`
 */
export function extractXRayTraceId(row: ReadonlyArray<ResultField>): string | undefined {
  const xrayField = extractCwField(row, 'xrayTraceId');
  if (xrayField === undefined) {
    return undefined;
  }

  const match = X_RAY_ROOT_PATTERN.exec(xrayField);
  return match?.[1] ?? xrayField;
}
