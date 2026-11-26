import type { TraceIdFormat } from './TraceIdFormat.js';
import type { TraceIdFormatMatch } from './TraceIdFormatMatch.js';

/** An X-Ray trace id: `1-`, 8 hex digits, a dash and 24 hex digits. */
const XRAY_TRACE_ID = /^1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24}$/u;

/**
 * The compact form of an X-Ray trace id, which is also a Trace ID of W3C (OpenTelemetry, the `operation_Id` of Azure):
 * 32 hex digits, not all zeros.
 */
const COMPACT_TRACE_ID = /^(?!0{32}$)[0-9a-fA-F]{32}$/u;

/** An X-Ray trace id anywhere in a message. */
const XRAY_IN_MESSAGE = /\b1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24}\b/u;

/**
 * A compact trace id in a message, only when labeled (`"trace_id":"<hex>"`, `traceId=<hex>`): a bare 32-hex token may
 * be an MD5 or a UUID without dashes.
 */
const LABELED_COMPACT_IN_MESSAGE = /trace[_-]?id["'\s:=]+([0-9a-f]{32})(?![0-9a-f])/iu;

/** The X-Ray and compact tokens of a message. */
const XRAY_TOKENS = /\b(?:1-[0-9a-fA-F]{8}-[0-9a-fA-F]{24}|[0-9a-fA-F]{32})\b/gu;

function parseXray(value: string): string | undefined {
  if (XRAY_TRACE_ID.test(value)) return value.toLowerCase();
  if (COMPACT_TRACE_ID.test(value)) return `1-${value.slice(0, 8)}-${value.slice(8)}`.toLowerCase();
  return undefined;
}

/**
 * X-Ray trace ids (`1-6789abcd-0123456789abcdef01234567`), also written in their compact 32-hex form, which is the
 * Trace ID of W3C of the same trace; the canonical form is the lowercase X-Ray one.
 */
const XRAY_TRACE_ID_FORMAT: TraceIdFormat = {
  name: 'x-ray',
  parse: parseXray,
  searchForms: (canonical) => [canonical, canonical.slice(2).replaceAll('-', '')],
  messageTokens: XRAY_TOKENS,
  findInMessage: (message) => {
    const xray = XRAY_IN_MESSAGE.exec(message)?.[0];
    if (xray !== undefined) return { raw: xray, canonical: xray.toLowerCase() };
    const labeled = LABELED_COMPACT_IN_MESSAGE.exec(message)?.[1];
    const canonical = labeled === undefined ? undefined : parseXray(labeled);
    return labeled === undefined || canonical === undefined ? undefined : { raw: labeled, canonical };
  },
};

/** The UUID a SEND service gives a request that arrived without an X-Ray trace id, in the trace field of its logs. */
const FALLBACK_UUID = /^FALLBACK-UUID:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;

/** The same id anywhere in a message. */
const FALLBACK_UUID_IN_MESSAGE = /\bFALLBACK-UUID:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;

/**
 * Fallback UUIDs as a trace of SEND (`FALLBACK-UUID:<uuid>`); the canonical form has the label in uppercase and the
 * UUID in lowercase. A message names many of them (the calls of a request carry their own): it never gives a trace to
 * discover, only to attribute a row.
 */
const FALLBACK_UUID_TRACE_ID_FORMAT: TraceIdFormat = {
  name: 'fallback-uuid',
  parse: (value) => {
    const uuid = FALLBACK_UUID.exec(value)?.[1];
    return uuid === undefined ? undefined : `FALLBACK-UUID:${uuid.toLowerCase()}`;
  },
  searchForms: (canonical) => [canonical],
  messageTokens: FALLBACK_UUID_IN_MESSAGE,
  findInMessage: () => undefined,
};

/** A UUID labeled `traceId:`, as the application logs write the trace of a request they started. */
const PREFIXED_UUID = /^traceId:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;

/** The same id anywhere in a message: every occurrence, and the first one. */
const PREFIXED_UUID_IN_MESSAGE = /\btraceId:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
const FIRST_PREFIXED_UUID_IN_MESSAGE = new RegExp(PREFIXED_UUID_IN_MESSAGE.source, 'iu');

function parsePrefixedUuid(value: string): string | undefined {
  const uuid = PREFIXED_UUID.exec(value)?.[1];
  return uuid === undefined ? undefined : `traceId:${uuid.toLowerCase()}`;
}

/**
 * Trace ids written as a UUID labeled `traceId:` (`traceId:c84c10f5-c213-44bd-9d46-e71204834571`); the canonical form
 * has the label as written here and the UUID in lowercase.
 */
const PREFIXED_UUID_TRACE_ID_FORMAT: TraceIdFormat = {
  name: 'prefixed-uuid',
  parse: parsePrefixedUuid,
  searchForms: (canonical) => [canonical],
  messageTokens: PREFIXED_UUID_IN_MESSAGE,
  findInMessage: (message) => {
    const raw = FIRST_PREFIXED_UUID_IN_MESSAGE.exec(message)?.[0];
    const canonical = raw === undefined ? undefined : parsePrefixedUuid(raw);
    return raw === undefined || canonical === undefined ? undefined : { raw, canonical };
  },
};

/**
 * The kinds of tracing id the module recognizes, in the order a value or a message is tried against them: X-Ray (with
 * its compact form, the W3C Trace ID), the Fallback UUID of SEND and the `traceId:<uuid>` of the application logs. A
 * new kind is one more entry.
 */
export const TRACE_ID_FORMATS: ReadonlyArray<TraceIdFormat> = [
  XRAY_TRACE_ID_FORMAT,
  FALLBACK_UUID_TRACE_ID_FORMAT,
  PREFIXED_UUID_TRACE_ID_FORMAT,
];

/**
 * The format of a direct tracing id, with its canonical form.
 *
 * @param value - Candidate id, without spaces around it
 * @returns The format and the canonical id, or nothing when the value is not an id of a known format
 *
 * @example
 * ```typescript
 * traceIdFormatOf('traceId:C84C10F5-C213-44BD-9D46-E71204834571')?.canonical; // 'traceId:c84c10f5-…'
 * ```
 */
export function traceIdFormatOf(value: string): TraceIdFormatMatch | undefined {
  for (const format of TRACE_ID_FORMATS) {
    const canonical = format.parse(value);
    if (canonical !== undefined) return { format, canonical };
  }
  return undefined;
}
