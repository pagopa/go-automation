const DEFAULT_RESULT_LIMIT = 1000;
const MAX_RESULT_LIMIT = 100_000;

/** Options for the canonical SEND downstream-detection query. */
export interface DownstreamDetectionQueryOptions {
  /** Exact service name emitted after `[DOWNSTREAM] Service` in application logs. */
  readonly downstreamName: string;
  /** HTTP status codes that must not contribute to the diagnosis. */
  readonly excludedStatusCodes?: ReadonlyArray<number>;
  /** Maximum number of chronologically ordered rows returned by Logs Insights. */
  readonly resultLimit?: number;
}

/**
 * Builds the canonical CloudWatch Logs Insights query for SEND downstream errors.
 *
 * The exact downstream marker is filtered before projecting fields. This keeps
 * the query selective while preserving both the structured `message` field and
 * the always-available raw `@message` field expected by the SEND service schema.
 */
export function buildDownstreamDetectionQuery(options: DownstreamDetectionQueryOptions): string {
  const downstreamName = options.downstreamName.trim();
  if (downstreamName === '') {
    throw new Error('buildDownstreamDetectionQuery: downstreamName must be a non-empty string.');
  }

  const resultLimit = options.resultLimit ?? DEFAULT_RESULT_LIMIT;
  if (!Number.isInteger(resultLimit) || resultLimit < 1 || resultLimit > MAX_RESULT_LIMIT) {
    throw new Error(
      `buildDownstreamDetectionQuery: resultLimit must be an integer between 1 and ${String(MAX_RESULT_LIMIT)}.`,
    );
  }

  const excludedStatusCodes = [...new Set(options.excludedStatusCodes ?? [])].sort((left, right) => left - right);
  for (const statusCode of excludedStatusCodes) {
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
      throw new Error('buildDownstreamDetectionQuery: excluded status codes must be integers between 100 and 599.');
    }
  }

  const marker = `[DOWNSTREAM] Service ${downstreamName} returned errors=`;
  const filters = [
    `@message like ${quoteLogsInsightsString(marker)}`,
    ...excludedStatusCodes.map(
      (statusCode) => `@message not like ${quoteLogsInsightsString(`${marker}${String(statusCode)}`)}`,
    ),
  ];

  return [
    `filter ${filters.join('\n    and ')}`,
    '| fields @timestamp, level, trace_id, message, @message',
    '| sort @timestamp asc',
    `| limit ${String(resultLimit)}`,
  ].join('\n');
}

function quoteLogsInsightsString(value: string): string {
  return `'${value.replace(/\0/g, '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
