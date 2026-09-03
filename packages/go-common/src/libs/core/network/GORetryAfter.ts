import { trimToUndefined } from '../utils/GOStringUtils.js';

/**
 * `delay-seconds` as defined by RFC 9110 §10.2.3: one or more digits, and
 * nothing else. Rejects `1.5`, `+5`, `-5`, `0x10` and `120abc`, none of which
 * a conforming server may send.
 */
const DELAY_SECONDS_PATTERN = /^\d+$/u;

const DAY = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
const DAY_LONG = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
const TIME = '(?:[01]\\d|2[0-3]):[0-5]\\d:(?:[0-5]\\d|60)';

/**
 * The preferred format, and the only one a conforming server should send:
 * `Sun, 06 Nov 1994 08:49:37 GMT` (RFC 9110 §5.6.7).
 */
const IMF_FIXDATE = new RegExp(`^${DAY}, \\d{2} ${MONTH} \\d{4} ${TIME} GMT$`, 'u');

/** Obsolete RFC 850 format: `Sunday, 06-Nov-94 08:49:37 GMT`. */
const RFC_850_DATE = new RegExp(`^${DAY_LONG}, \\d{2}-${MONTH}-\\d{2} ${TIME} GMT$`, 'u');

/**
 * Obsolete asctime format: `Sun Nov  6 08:49:37 1994`. It carries no timezone,
 * and RFC 9110 §5.6.7 requires it to be read as GMT — while `Date.parse` reads
 * it in host-local time, which shifts the delay by the machine's offset.
 */
const ASCTIME_DATE = new RegExp(`^${DAY} ${MONTH} (?:[ 1-2]\\d|3[01]) ${TIME} \\d{4}$`, 'u');

/**
 * Parses an HTTP-date in any of the three grammars RFC 9110 admits.
 *
 * A leading-letter test used to stand in for this, but it only kept
 * `Date.parse` away from bare numbers: `January 1, 2030` and `Mar 2027` passed
 * it and resolved to delays of years. That contradicts the documented
 * malformed-value fallback, and `GOFileDownloader` honours the value uncapped.
 *
 * @param value - Trimmed header value
 * @returns Epoch milliseconds, or `undefined` when the value is not an HTTP-date
 */
function parseHttpDateMs(value: string): number | undefined {
  if (IMF_FIXDATE.test(value) || RFC_850_DATE.test(value)) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  // asctime: appended `GMT` is what makes `Date.parse` read it as the RFC says.
  if (ASCTIME_DATE.test(value)) {
    const parsed = Date.parse(`${value} GMT`);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

/**
 * Parses a `Retry-After` response header into a delay in milliseconds.
 *
 * The header carries either `delay-seconds` or an HTTP-date
 * (RFC 9110 §10.2.3). A malformed value yields `undefined` so the caller
 * falls back to its own backoff, which is always safer than honouring a
 * half-understood value: parsing `Retry-After: ` as `0` turns a rate-limit
 * response into a hot retry loop against the very server asking us to wait.
 *
 * The returned delay is **not** capped: an untrusted server can ask for an
 * arbitrarily long wait, so the caller decides the ceiling it accepts
 * (`GOHttpRetryPolicy.maxRetryAfterMs`, for instance).
 *
 * @param headerValue - Raw header value, as returned by `headers.get()`
 * @param now - Epoch milliseconds used to resolve an HTTP-date; injectable
 *   for testing, defaults to the current time
 * @returns The delay in milliseconds, or `undefined` when the header is
 *   absent or does not conform to the grammar
 *
 * @example
 * ```typescript
 * parseRetryAfterMs('120');                              // 120_000
 * parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT');    // ms until that instant, 0 if past
 * parseRetryAfterMs('soon');                             // undefined
 * ```
 */
export function parseRetryAfterMs(
  headerValue: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  const value = trimToUndefined(headerValue ?? undefined);
  if (value === undefined) return undefined;

  if (DELAY_SECONDS_PATTERN.test(value)) {
    const delayMs = Number(value) * 1_000;
    // A digit run long enough to overflow to Infinity is not a usable delay.
    return Number.isFinite(delayMs) ? delayMs : undefined;
  }

  const dateMs = parseHttpDateMs(value);
  if (dateMs === undefined) return undefined;
  // A date already in the past means "retry now", not "retry in the past".
  return Math.max(0, dateMs - now);
}
