import { GODateTokens } from '@pagopa/go-common/dates';
import { trimToUndefined } from '@pagopa/go-common/utils';

import type { EvidenceIdentifierKind, EvidenceTime, TimedEvidenceIdentifier } from '../../../../../engine/index.js';

/** Field names carrying the time of a plain row. */
const TIMESTAMP_FIELDS: ReadonlyArray<string> = ['@timestamp', 'timestamp'];

/** Field names carrying a typed identifier, by kind. */
const IDENTIFIER_FIELDS: ReadonlyArray<readonly [field: string, kind: EvidenceIdentifierKind]> = [
  ['trace_id', 'traceId'],
  ['xrayTraceId', 'traceId'],
  ['@requestId', 'requestId'],
  ['requestId', 'requestId'],
  ['cid', 'cid'],
  ['cidValue', 'cid'],
];

/** A field of a Logs Insights result row. */
interface ResultField {
  readonly field: string;
  readonly value: string;
}

/**
 * Reads the time of an evidence element of the toolkits, for the engine's `evidenceTime` option.
 *
 * Recognised shapes:
 * - a Logs Insights row (`[{ field, value }]`): `@timestamp` (or `timestamp`) with weight 1, or the
 *   `firstTimestamp`/`latestTimestamp` of an aggregate row with weight `count`;
 * - an object with `supportingRows`: the bounds of the rows that support it, weighted by their number;
 * - a group `{ …, rows }`: the bounds of the whole group, weight 1 (a declared approximation);
 * - a plain object with `@timestamp` or `timestamp`.
 *
 * Typed identifiers (`trace_id`, `requestId`, `cid`, …) are read from rows and plain objects.
 *
 * @param element - An element of an array step output matched by a known error
 * @returns The time of the element, or `undefined` when it has none
 */
export function readEvidenceTime(element: unknown): EvidenceTime | undefined {
  if (isResultRow(element)) return readRowTime(element);
  if (typeof element !== 'object' || element === null) return undefined;
  const record = element as Readonly<Record<string, unknown>>;

  const supporting = record['supportingRows'];
  if (Array.isArray(supporting)) return combine(supporting.map(readEvidenceTime), supporting.length);

  const rows = record['rows'];
  if (Array.isArray(rows)) return combine(rows.map(readEvidenceTime), 1);

  const fields = Object.entries(record).flatMap(([field, value]) =>
    typeof value === 'string' ? [{ field, value }] : [],
  );
  return readRowTime(fields);
}

function readRowTime(row: ReadonlyArray<ResultField>): EvidenceTime | undefined {
  const values = new Map(row.map(({ field, value }) => [field, value]));
  const identifiers = IDENTIFIER_FIELDS.flatMap(([field, kind]) => {
    const value = trimToUndefined(values.get(field));
    return value === undefined || value === '-' ? [] : [{ kind, value }];
  });

  const latest = parseTimestamp(values.get('latestTimestamp'));
  if (latest !== undefined) {
    const first = parseTimestamp(values.get('firstTimestamp')) ?? latest;
    const count = Number(values.get('count'));
    // The identifiers of an aggregate are those of `latest(...)`: they belong to its latest row.
    return withIdentifiers(
      { first: Math.min(first, latest), last: latest, weight: Number.isFinite(count) && count > 0 ? count : 1 },
      identifiers.map((identifier) => ({ ...identifier, at: latest })),
    );
  }

  for (const field of TIMESTAMP_FIELDS) {
    const at = parseTimestamp(values.get(field));
    if (at !== undefined) {
      return withIdentifiers(
        { first: at, last: at, weight: 1 },
        identifiers.map((identifier) => ({ ...identifier, at })),
      );
    }
  }
  // No time, but identifiers: they still belong to the evidence, as untimed observations.
  return identifiers.length === 0 ? undefined : { weight: 1, identifiers };
}

function combine(times: ReadonlyArray<EvidenceTime | undefined>, weight: number): EvidenceTime | undefined {
  let first: number | undefined;
  let last: number | undefined;
  const identifiers: TimedEvidenceIdentifier[] = [];
  for (const time of times) {
    if (time === undefined) continue;
    if (time.first !== undefined) first = first === undefined ? time.first : Math.min(first, time.first);
    if (time.last !== undefined) last = last === undefined ? time.last : Math.max(last, time.last);
    // Each identifier keeps the time its own row gave it (or none), never the bounds of a combination.
    identifiers.push(...(time.identifiers ?? []));
  }
  const bounds = first === undefined || last === undefined ? {} : { first, last };
  if (first === undefined && identifiers.length === 0) return undefined;
  return withIdentifiers({ ...bounds, weight: Math.max(1, weight) }, identifiers);
}

function withIdentifiers(time: EvidenceTime, identifiers: ReadonlyArray<TimedEvidenceIdentifier>): EvidenceTime {
  return identifiers.length === 0 ? time : { ...time, identifiers };
}

/**
 * Parses an evidence timestamp to epoch milliseconds; a Logs Insights timestamp has no zone and is UTC.
 *
 * @returns The instant, or `undefined` for a missing or unparseable value
 */
function parseTimestamp(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '' || value === '-') return undefined;
  try {
    // ISO, SQL (`2026-11-19 10:15:42.123`, as Logs Insights renders it) and epochs; no zone means UTC.
    return GODateTokens.parse(value, 'UTC').getTime();
  } catch {
    return undefined;
  }
}

function isResultRow(element: unknown): element is ReadonlyArray<ResultField> {
  return (
    Array.isArray(element) &&
    element.length > 0 &&
    element.every(
      (item: unknown) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { field?: unknown }).field === 'string' &&
        typeof (item as { value?: unknown }).value === 'string',
    )
  );
}
