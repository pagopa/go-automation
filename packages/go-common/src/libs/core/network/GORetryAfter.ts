import { trimToUndefined } from '../utils/GOStringUtils.js';

/**
 * `delay-seconds` as defined by RFC 9110 §10.2.3: one or more digits, and
 * nothing else. Rejects `1.5`, `+5`, `-5`, `0x10` and `120abc`, none of which
 * a conforming server may send.
 */
const DELAY_SECONDS_PATTERN = /^\d+$/u;

/**
 * All three date formats RFC 9110 admits start with a day name (`Wed, …`,
 * `Wednesday, …`, `Wed Oct …`). Requiring a leading letter keeps `Date.parse`
 * away from values it would otherwise swallow: it reads `-5`, `+5` and `1.5`
 * as years, which would turn a malformed header into a past date and thus
 * into a zero delay — exactly the hot retry this parser exists to prevent.
 */
const HTTP_DATE_PATTERN = /^[A-Za-z]/u;

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

  if (!HTTP_DATE_PATTERN.test(value)) return undefined;

  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return undefined;
  // A date already in the past means "retry now", not "retry in the past".
  return Math.max(0, dateMs - now);
}
