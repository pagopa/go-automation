import type { ServiceLogSchema } from '../../../../common/parsing/applicationLogs/ServiceLogSchema.js';
import type { KnownUrlsRegistry } from '../../../../common/parsing/knownUrls/KnownUrlsRegistry.js';
import { matchTraceIdCandidate } from '../../../../common/parsing/traceIds/matchTraceIdCandidate.js';
import { readServiceLogRow } from '../../../../common/parsing/applicationLogs/readServiceLogRow.js';
import type { ServiceLogRow } from '../../../../common/parsing/applicationLogs/ServiceLogRow.js';
import { RepresentativeErrorSelector } from '../../../../common/parsing/applicationLogs/RepresentativeErrorSelector.js';
import type { TraceIdCandidateMatch } from '../../../../common/parsing/traceIds/TraceIdCandidateMatch.js';
import { FALLBACK_UUID_GLOBAL_PATTERN, extractFallbackUuid } from './extractFallbackUuid.js';
import type { CloudWatchLogsRows } from '../../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';
import type { KnownUrlInLogs } from './KnownUrlInLogs.js';
import type { ServiceLogsScan } from './ServiceLogsScan.js';

/** Extracts `http(s)://…` tokens up to the first whitespace/quote/bracket. */
const URL_PATTERN = /https?:\/\/[^\s'"<>`]+/g;

/** Trailing punctuation trimmed from an observed URL before registry match. */
const TRAILING_TRIM = /[).,;:\]]+$/;

/**
 * Scans a service's CloudWatch Logs result set **once**, computing every
 * projection the analysis step needs:
 *
 * - the most representative error message (ERROR/WARN level wins; keyword
 *   heuristic as fallback);
 * - a known URL, preferring ERROR/WARN rows, then level-less error keywords,
 *   then other rows; the first match wins within each priority;
 * - the selected URL's `FALLBACK-UUID`, or the first token when no URL is selected;
 * - the first valid trace id candidate.
 *
 * Each row is materialised into a `Map<field, value>` exactly once, so
 * field lookups are O(1) instead of the O(fields) `Array.find` of
 * {@link readRowField}. Overall cost is O(rows · fields), versus the
 * O(rows · fields · ~6) of calling the four granular helpers separately.
 *
 * @param results - CloudWatch Logs Insights result rows
 * @param schema - Service log schema (message/level/trace-id field names)
 * @param registry - Optional known-URL registry; when omitted the
 *   `knownUrl` projection is left `undefined`
 * @returns The aggregated {@link ServiceLogsScan}
 */
export function scanServiceLogs(
  results: CloudWatchLogsRows,
  schema: ServiceLogSchema,
  registry?: KnownUrlsRegistry,
): ServiceLogsScan {
  // The longest error describes the failure best along the chain of services.
  const errorMessage = new RepresentativeErrorSelector('longest');
  let traceIdCandidate: TraceIdCandidateMatch | undefined;
  const rows = results.map((raw) => readServiceLogRow(raw, schema));
  for (const row of rows) {
    errorMessage.offer(row);
    // Trace id candidate — first match wins, from the trace-id field only.
    traceIdCandidate ??= matchTraceIdCandidate(row.fields, schema, 'field');
  }
  return { errorMessage: errorMessage.result(), ...findKnownUrlCall(rows, registry), traceIdCandidate };
}

/**
 * The known URL that rows already read call, with the fallback UUID of the call: the projection of
 * {@link scanServiceLogs} for rows read once by the caller.
 *
 * - The known URL prefers ERROR/WARN rows, then level-less error keywords, then other rows; the first match wins
 *   within each priority.
 * - The fallback UUID is the one of the selected URL, or the first token of the rows when no URL is selected.
 *
 * Complexity: O(R) over the rows.
 *
 * @param rows - Rows read with `readServiceLogRow`
 * @param registry - Optional known-URL registry; when omitted no known URL is selected
 * @returns The known URL and the fallback UUID
 *
 * @example
 * ```typescript
 * const { knownUrl } = findKnownUrlCall([readServiceLogRow(raw, schema)], registry);
 * ```
 */
export function findKnownUrlCall(
  rows: ReadonlyArray<ServiceLogRow>,
  registry?: KnownUrlsRegistry,
): Pick<ServiceLogsScan, 'knownUrl' | 'fallbackUuid'> {
  let knownUrl: KnownUrlInLogs | undefined;
  let knownUrlPriority = -1;
  let knownUrlFallbackUuid: string | undefined;
  let fallbackUuid: string | undefined;
  for (const row of rows) {
    if (row.message === '') continue;
    // Prefer failure evidence over earlier invocation/success rows.
    const urlPriority = row.isErrorLevel ? 2 : row.level === '' && row.hasErrorKeyword ? 1 : 0;
    if (urlPriority > knownUrlPriority && registry !== undefined) {
      const candidate = matchKnownUrl(row.message, registry);
      if (candidate !== undefined) {
        knownUrl = candidate;
        knownUrlPriority = urlPriority;
        knownUrlFallbackUuid = associatedFallbackUuid(row.message, registry);
      }
    }
    // Fallback UUID — first match wins.
    fallbackUuid ??= extractFallbackUuid(row.message);
  }
  return { knownUrl, fallbackUuid: knownUrl !== undefined ? knownUrlFallbackUuid : fallbackUuid };
}

/** A message must identify one known invocation and one UUID to pair them. */
function associatedFallbackUuid(message: string, registry: KnownUrlsRegistry): string | undefined {
  const uuids = new Set([...message.matchAll(FALLBACK_UUID_GLOBAL_PATTERN)].map((match) => match[1]));
  if (uuids.size !== 1) return undefined;
  const knownUrls = new Set(
    (message.match(URL_PATTERN) ?? [])
      .map((url) => url.replace(TRAILING_TRIM, ''))
      .filter((url) => registry.match(url) !== undefined),
  );
  return knownUrls.size === 1 ? uuids.values().next().value : undefined;
}

/**
 * Probes a message for the first URL matching the registry.
 */
function matchKnownUrl(message: string, registry: KnownUrlsRegistry): KnownUrlInLogs | undefined {
  const urls = message.match(URL_PATTERN);
  if (urls === null) return undefined;

  for (const raw of urls) {
    const trimmed = raw.replace(TRAILING_TRIM, '');
    if (trimmed === '') continue;
    const match = registry.match(trimmed);
    if (match !== undefined) {
      return { observedUrl: trimmed, known: match.known };
    }
  }
  return undefined;
}
