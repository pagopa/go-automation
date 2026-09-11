const DEFAULT_RESULT_LIMIT = 1000;
const MAX_RESULT_LIMIT = 100_000;

/** Options for the canonical SEND downstream-detection query. */
export type DownstreamDetectionQueryOptions = DownstreamDetectionQueryCommonOptions &
  (
    | {
        /** Exact service name emitted after `[DOWNSTREAM] Service` in application logs. */
        readonly downstreamName: string;
        readonly matchAnyService?: false;
        /** HTTP status codes that must not contribute to the diagnosis. */
        readonly excludedStatusCodes?: ReadonlyArray<number>;
        /**
         * Also require the marker in the parsed `message` field, not only in the
         * raw `@message` event.
         *
         * The raw event carries the whole record, so a marker quoted inside a
         * stack trace matches it while the structured field stays clean. An
         * alarm whose metric filter reads `message` counts only the latter, and
         * a runbook that scanned both would analyse occurrences the alarm never
         * raised.
         */
        readonly matchStructuredMessage?: boolean;
      }
    | {
        /** Match the generic metric-filter contract when the alarm covers every emitted service name. */
        readonly matchAnyService: true;
        readonly downstreamName?: never;
        // Both of these describe the exact marker, which this variant does not
        // build: it matches `[DOWNSTREAM]` and `returned errors=` as separate
        // fragments and never assembles a service name. Declaring them here as
        // `never` turns passing one into a compile error rather than an option
        // that silently does nothing; the constructor rejects them at runtime
        // too, for options assembled dynamically.
        readonly excludedStatusCodes?: never;
        readonly matchStructuredMessage?: never;
      }
  );

interface DownstreamDetectionQueryCommonOptions {
  /**
   * Also require `level = 'ERROR'`, as the `matchAnyService` variant always
   * does. For alarms whose metric filter carries that predicate too, so the
   * runbook counts what the alarm counted.
   *
   * Additive in both variants: it never removes the predicate from the generic
   * query, which carries it by contract.
   */
  readonly errorLevelOnly?: boolean;
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
    if (options.matchStructuredMessage !== undefined) {
      throw new Error('buildDownstreamDetectionQuery: matchStructuredMessage requires an exact downstreamName.');
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
    if (options.matchStructuredMessage === true) {
      const marker = `[DOWNSTREAM] Service ${downstreamName} returned errors=`;
      filters = [`message like ${quoteLogsInsightsString(marker)}`, ...filters];
    }
    if (options.errorLevelOnly === true) filters = ["level = 'ERROR'", ...filters];
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
