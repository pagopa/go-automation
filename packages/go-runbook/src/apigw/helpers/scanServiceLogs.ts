import type { ResultField } from '@go-automation/go-common/aws';

import type { ServiceLogSchema } from '../profiles/schemas/ServiceLogSchema.js';
import type { KnownUrlsRegistry } from '../registries/KnownUrlsRegistry.js';
import type { KnownUrl } from '../types/KnownUrl.js';
import { transformRawTraceId } from './transformRawTraceId.js';

/**
 * Keyword tokens that flag a message as "error-like" in the keyword
 * fallback pass. Includes Lambda runtime markers (`Status: timeout`,
 * `Status: error`) from `REPORT` lines, which carry no `level` field.
 */
const ERROR_KEYWORDS: ReadonlyArray<string> = [
  'Exception',
  'Error',
  'failed',
  'FAILURE',
  'Status: timeout',
  'Status: error',
];

/**
 * Matches the `FALLBACK-UUID:<uuid>` token (canonical 8-4-4-4-12 hex),
 * anchored on `FALLBACK-UUID:` to avoid catching the X-Ray trace id.
 */
const FALLBACK_UUID_PATTERN =
  /FALLBACK-UUID:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

/** Extracts `http(s)://…` tokens up to the first whitespace/quote/bracket. */
const URL_PATTERN = /https?:\/\/[^\s'"<>`]+/g;

/** Trailing punctuation trimmed from an observed URL before registry match. */
const TRAILING_TRIM = /[).,;:\]]+$/;

/**
 * Known URL match observed inside service logs.
 */
export interface KnownUrlInLogs {
  /** URL exactly as observed in the log message (already trimmed). */
  readonly observedUrl: string;
  /** Registry entry that matched the observed URL. */
  readonly known: KnownUrl;
}

/**
 * Trace id candidate observed inside service logs.
 */
export interface TraceIdCandidateMatch {
  /** Raw token as it appeared in the log row (32 hex chars or canonical). */
  readonly raw: string;
  /** Canonical X-Ray form (`1-XXXXXXXX-...`). */
  readonly canonical: string;
}

/**
 * Aggregated outcome of a single pass over a service's CloudWatch Logs
 * result set. Bundles the four projections the API Gateway analysis loop
 * needs so the rows are walked once instead of four-to-six times.
 */
export interface ServiceLogsScan {
  /** Most representative error message (empty string when none). */
  readonly errorMessage: string;
  /** First known URL in the strongest failure evidence, falling back to other rows. */
  readonly knownUrl: KnownUrlInLogs | undefined;
  /** UUID associated with the selected URL; first token when no URL is selected. */
  readonly fallbackUuid: string | undefined;
  /** First valid trace id candidate, or `undefined`. */
  readonly traceIdCandidate: TraceIdCandidateMatch | undefined;
}

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
  results: ReadonlyArray<ReadonlyArray<ResultField>>,
  schema: ServiceLogSchema,
  registry?: KnownUrlsRegistry,
): ServiceLogsScan {
  let bestByLevel = '';
  let bestByKeyword = '';
  let knownUrl: KnownUrlInLogs | undefined;
  let knownUrlPriority = -1;
  let knownUrlFallbackUuid: string | undefined;
  let fallbackUuid: string | undefined;
  let traceIdCandidate: TraceIdCandidateMatch | undefined;

  for (const row of results) {
    const fields = new Map<string, string>();
    for (const field of row) {
      // ResultField.field / .value are both optional in the AWS SDK type;
      // a pair is only usable when both are present. First occurrence wins.
      if (field.field !== undefined && field.value !== undefined && !fields.has(field.field)) {
        fields.set(field.field, field.value);
      }
    }

    const message = readMessage(fields, schema);

    if (message !== '') {
      const level = (fields.get(schema.levelField) ?? '').toLowerCase();
      const isErrorLevel = level.includes('error') || level.includes('warn');
      const hasErrorKeyword = ERROR_KEYWORDS.some((keyword) => message.includes(keyword));

      // Error message — level pass: an explicit ERROR/WARN row is the
      // strongest signal; keep the longest such message.
      if (isErrorLevel && message.length > bestByLevel.length) {
        bestByLevel = message;
      }

      // Error message — keyword fallback pass: only rows without a level
      // or with an ERROR/WARN level are eligible (avoids DEBUG noise).
      if ((level === '' || isErrorLevel) && message.length > bestByKeyword.length) {
        if (hasErrorKeyword) {
          bestByKeyword = message;
        }
      }

      // Prefer failure evidence over earlier invocation/success rows.
      const urlPriority = isErrorLevel ? 2 : level === '' && hasErrorKeyword ? 1 : 0;
      if (urlPriority > knownUrlPriority && registry !== undefined) {
        const candidate = matchKnownUrl(message, registry);
        if (candidate !== undefined) {
          knownUrl = candidate;
          knownUrlPriority = urlPriority;
          knownUrlFallbackUuid = associatedFallbackUuid(message, registry);
        }
      }

      // Fallback UUID — first match wins.
      if (fallbackUuid === undefined) {
        const match = FALLBACK_UUID_PATTERN.exec(message);
        if (match?.[1] !== undefined) {
          fallbackUuid = match[1];
        }
      }
    }

    // Trace id candidate — first match wins. Reads its own fields, so it
    // runs regardless of whether the row carries a message. `??=`
    // short-circuits: matchTraceIdCandidate is skipped once one is found.
    traceIdCandidate ??= matchTraceIdCandidate(fields, schema);
  }

  return {
    errorMessage: bestByLevel !== '' ? bestByLevel : bestByKeyword,
    knownUrl,
    fallbackUuid: knownUrl !== undefined ? knownUrlFallbackUuid : fallbackUuid,
    traceIdCandidate,
  };
}

/** A message must identify one known invocation and one UUID to pair them. */
function associatedFallbackUuid(message: string, registry: KnownUrlsRegistry): string | undefined {
  const uuids = new Set([...message.matchAll(new RegExp(FALLBACK_UUID_PATTERN.source, 'g'))].map((match) => match[1]));
  if (uuids.size !== 1) return undefined;
  const knownUrls = new Set(
    (message.match(URL_PATTERN) ?? [])
      .map((url) => url.replace(TRAILING_TRIM, ''))
      .filter((url) => registry.match(url) !== undefined),
  );
  return knownUrls.size === 1 ? uuids.values().next().value : undefined;
}

/**
 * Returns the first non-empty message field declared by the schema.
 */
function readMessage(fields: ReadonlyMap<string, string>, schema: ServiceLogSchema): string {
  for (const candidate of schema.messageFieldCandidates) {
    const value = fields.get(candidate);
    if (value !== undefined) return value;
  }
  return '';
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

/**
 * Extracts a valid trace id candidate from the row's trace-id field
 * (or its `@`-aliased form).
 */
function matchTraceIdCandidate(
  fields: ReadonlyMap<string, string>,
  schema: ServiceLogSchema,
): TraceIdCandidateMatch | undefined {
  const primary = fields.get(schema.traceIdField);
  const aliased = fields.get(`@${schema.traceIdField}`);
  const raw = (primary ?? aliased ?? '').trim();
  if (raw === '' || raw === '-') return undefined;

  const canonical = transformRawTraceId(raw);
  if (canonical === undefined) return undefined;

  return { raw, canonical };
}
