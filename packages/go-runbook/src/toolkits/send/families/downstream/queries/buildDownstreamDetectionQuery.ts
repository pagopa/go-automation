import type { DownstreamMarkerField } from '../types/DownstreamMarkerField.js';

const DEFAULT_RESULT_LIMIT = 1000;
const MAX_RESULT_LIMIT = 100_000;
/** Fields selected when the caller declares no projection: the SEND service schema. */
const DEFAULT_PROJECTION: ReadonlyArray<string> = ['@timestamp', 'level', 'trace_id', 'message', '@message'];
/** A Logs Insights field name: optional `@`, then an identifier, dotted paths allowed. */
const FIELD_NAME = /^@?[A-Za-z_][A-Za-z0-9_.]*$/u;

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
        /**
         * Field that carries the marker (EVO-RBREORG-OPUS-01 R4, RBREORG-25):
         * - `'@message'` (default): the raw event, as every downstream query does today;
         * - `'message'`: **only** the structured field, with no raw `@message` predicate. For
         *   payloads too large to scan raw, and so a marker quoted in a raw stack trace never
         *   counts. The exclusions read the same field.
         *
         * Not combinable with `matchStructuredMessage`, which adds the structured predicate
         * to the raw one instead of replacing it.
         */
        readonly markerField?: DownstreamMarkerField;
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
        readonly markerField?: never;
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
  /**
   * Fields the query selects, in order; default `@timestamp, level, trace_id, message, @message`.
   * Leaving out `@message` keeps very large raw events out of the result.
   */
  readonly projection?: ReadonlyArray<string>;
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

  const projection = validProjection(options.projection ?? DEFAULT_PROJECTION);
  const excludedStatusCodes = [...new Set(options.excludedStatusCodes ?? [])].sort((left, right) => left - right);
  for (const statusCode of excludedStatusCodes) {
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
      throw new Error('buildDownstreamDetectionQuery: excluded status codes must be integers between 100 and 599.');
    }
  }

  let filters: ReadonlyArray<string>;
  if (options.matchAnyService === true) {
    // Checked first, and the reason it is the strictest of the three: ignoring
    // a downstreamName here would not narrow the query, it would widen it. The
    // caller asked about one service and would get the markers of every one,
    // so the runbook would analyse occurrences its alarm never raised.
    if (options.downstreamName !== undefined) {
      throw new Error('buildDownstreamDetectionQuery: downstreamName and matchAnyService are mutually exclusive.');
    }
    if (excludedStatusCodes.length > 0) {
      throw new Error('buildDownstreamDetectionQuery: excluded status codes require an exact downstreamName.');
    }
    if (options.matchStructuredMessage !== undefined) {
      throw new Error('buildDownstreamDetectionQuery: matchStructuredMessage requires an exact downstreamName.');
    }
    if (options.markerField !== undefined) {
      throw new Error('buildDownstreamDetectionQuery: markerField requires an exact downstreamName.');
    }
    filters = [
      "level = 'ERROR'",
      `@message like ${quoteLogsInsightsString('[DOWNSTREAM]')}`,
      `@message like ${quoteLogsInsightsString('returned errors=')}`,
    ];
  } else {
    // The cast covers the same dynamically assembled options as the guards
    // above: the union makes the name mandatory here, but an object built at
    // runtime can arrive without it, and `.trim()` would then throw a
    // TypeError that names neither the option nor the function.
    const downstreamName = (options.downstreamName as string | undefined)?.trim() ?? '';
    if (downstreamName === '') {
      throw new Error('buildDownstreamDetectionQuery: downstreamName must be a non-empty string.');
    }
    // An exclusion has to read the field the inclusion reads, or the two answer
    // different questions. With the exclusions left on `@message`, a record
    // whose structured `message` says `errors=500` would still be dropped by
    // `@message not like '…errors=404'` if the raw event happened to quote a
    // 404 elsewhere, in a stack trace or a retry it embeds — suppressing an
    // occurrence the alarm counted.
    const markerField = validMarkerField(options.markerField);
    if (markerField === 'message' && options.matchStructuredMessage !== undefined) {
      throw new Error(
        "buildDownstreamDetectionQuery: markerField 'message' already reads only the structured field; drop matchStructuredMessage.",
      );
    }
    const exclusionField =
      markerField === 'message' || options.matchStructuredMessage === true ? 'message' : '@message';
    filters = exactServiceFilters(downstreamName, excludedStatusCodes, markerField, exclusionField);
    if (options.matchStructuredMessage === true) {
      filters = [`message like ${quoteLogsInsightsString(downstreamMarker(downstreamName))}`, ...filters];
    }
    if (options.errorLevelOnly === true) filters = ["level = 'ERROR'", ...filters];
  }

  return [
    `filter ${filters.join('\n    and ')}`,
    `| fields ${projection.join(', ')}`,
    '| sort @timestamp asc',
    `| limit ${String(resultLimit)}`,
  ].join('\n');
}

/**
 * The inclusion reads `markerField` (by default the raw event, which always carries the
 * marker). The exclusions take the field the caller is counting on, which `exclusionField` names.
 */
function exactServiceFilters(
  downstreamName: string,
  excludedStatusCodes: ReadonlyArray<number>,
  markerField: DownstreamMarkerField,
  exclusionField: string,
): ReadonlyArray<string> {
  const marker = downstreamMarker(downstreamName);
  return [
    `${markerField} like ${quoteLogsInsightsString(marker)}`,
    ...excludedStatusCodes.map(
      (statusCode) => `${exclusionField} not like ${quoteLogsInsightsString(`${marker}${String(statusCode)}`)}`,
    ),
  ];
}

/** The marker field, validated also for options assembled at runtime. */
function validMarkerField(value: unknown): DownstreamMarkerField {
  if (value === undefined || value === '@message') return '@message';
  if (value === 'message') return 'message';
  throw new Error("buildDownstreamDetectionQuery: markerField must be '@message' or 'message'.");
}

/** A non-empty list of distinct Logs Insights field names. */
function validProjection(projection: ReadonlyArray<string>): ReadonlyArray<string> {
  if (projection.length === 0) {
    throw new Error('buildDownstreamDetectionQuery: projection must select at least one field.');
  }
  if (new Set(projection).size !== projection.length || !projection.every((field) => FIELD_NAME.test(field))) {
    throw new Error('buildDownstreamDetectionQuery: projection must list distinct Logs Insights field names.');
  }
  return projection;
}

/** The exact text the application writes before the failing status or error. */
function downstreamMarker(downstreamName: string): string {
  return `[DOWNSTREAM] Service ${downstreamName} returned errors=`;
}

function quoteLogsInsightsString(value: string): string {
  return `'${value.replace(/\0/g, '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
