const DEFAULT_RESULT_LIMIT = 1000;
const MAX_RESULT_LIMIT = 100_000;

/** Options for the canonical SEND downstream-detection query. */
export type DownstreamDetectionQueryOptions = DownstreamDetectionQueryCommonOptions &
  (
    | {
        /** Exact service name emitted after `[DOWNSTREAM] Service` in application logs. */
        readonly downstreamName: string;
        readonly matchAnyService?: false;
      }
    | {
        /** Match the generic metric-filter contract when the alarm covers every emitted service name. */
        readonly matchAnyService: true;
        readonly downstreamName?: never;
      }
  );

interface DownstreamDetectionQueryCommonOptions {
  /** HTTP status codes that must not contribute to an exact-service diagnosis. */
  readonly excludedStatusCodes?: ReadonlyArray<number>;
  /** Maximum number of chronologically ordered rows returned by Logs Insights. */
  readonly resultLimit?: number;
}

/**
 * Builds the canonical CloudWatch Logs Insights query for SEND downstream errors.
 *
 * Exact-service queries filter the complete downstream marker. Alarms whose
 * metric filter intentionally covers every emitted service can opt into the
 * generic marker contract with `matchAnyService: true`.
 *
 * Both variants preserve the structured `message` field and the always-available
 * raw `@message` field expected by the SEND service schema.
 */
export function buildDownstreamDetectionQuery(options: DownstreamDetectionQueryOptions): string {
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

  let filters: ReadonlyArray<string>;
  if (options.matchAnyService === true) {
    if (excludedStatusCodes.length > 0) {
      throw new Error('buildDownstreamDetectionQuery: excluded status codes require an exact downstreamName.');
    }
    filters = [
      "level = 'ERROR'",
      `@message like ${quoteLogsInsightsString('[DOWNSTREAM]')}`,
      `@message like ${quoteLogsInsightsString('returned errors=')}`,
    ];
  } else {
    const downstreamName = options.downstreamName.trim();
    if (downstreamName === '') {
      throw new Error('buildDownstreamDetectionQuery: downstreamName must be a non-empty string.');
    }
    filters = exactServiceFilters(downstreamName, excludedStatusCodes);
  }

  return [
    `filter ${filters.join('\n    and ')}`,
    '| fields @timestamp, level, trace_id, message, @message',
    '| sort @timestamp asc',
    `| limit ${String(resultLimit)}`,
  ].join('\n');
}

function exactServiceFilters(
  downstreamName: string,
  excludedStatusCodes: ReadonlyArray<number>,
): ReadonlyArray<string> {
  const marker = `[DOWNSTREAM] Service ${downstreamName} returned errors=`;
  return [
    `@message like ${quoteLogsInsightsString(marker)}`,
    ...excludedStatusCodes.map(
      (statusCode) => `@message not like ${quoteLogsInsightsString(`${marker}${String(statusCode)}`)}`,
    ),
  ];
}

function quoteLogsInsightsString(value: string): string {
  return `'${value.replace(/\0/g, '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
