import type { GODurationParseOptions } from './GODurationParseOptions.js';

/** Largest delay `setTimeout` honours (2^31 - 1 ms, about 24.8 days); beyond it Node fires after 1 ms. */
export const SET_TIMEOUT_MAX_MS = 2_147_483_647;

const DURATION = /^(\d+|\d*\.\d+)(ms|s|m|h|d)$/;
const UNIT_MS: ReadonlyMap<string, number> = new Map([
  ['ms', 1],
  ['s', 1_000],
  ['m', 60_000],
  ['h', 3_600_000],
  ['d', 86_400_000],
]);

/**
 * Parses a duration such as `200ms`, `10s`, `15m`, `2h`, `6d` (CLI and config values).
 *
 * Grammar: one non-negative decimal number immediately followed by one
 * lower-case unit (`ms`, `s`, `m`, `h`, `d`); surrounding whitespace is
 * ignored. Combined units (`1h30m`), signs, exponents, inner spaces (`10 s`)
 * and upper-case units (`10S`, where `M` would be ambiguous) are rejected.
 * The result is rounded to whole milliseconds and must fall in
 * `[minMs, maxMs]`.
 *
 * @param value - Duration text
 * @param name - Parameter name, for the error message
 * @param options - Accepted range (default `0` to {@link SET_TIMEOUT_MAX_MS})
 * @returns Milliseconds (an integer)
 * @throws Error naming the parameter when the format is not valid or the
 *   value is out of range
 *
 * @example
 * ```typescript
 * parseDuration('1.5h', 'request.id.timeout'); // 5400000
 * parseDuration('0s', 'send.timeout', { minMs: 1 }); // Error: send.timeout: duration "0s" is 0 ms, below the minimum of 1 ms
 * ```
 */
export function parseDuration(value: string, name: string, options?: GODurationParseOptions): number {
  const match = DURATION.exec(value.trim());
  const unit = match?.[2] === undefined ? undefined : UNIT_MS.get(match[2]);
  if (match?.[1] === undefined || unit === undefined) {
    throw new Error(`${name}: invalid duration "${value}" (examples: 500ms, 10s, 15m, 2h)`);
  }
  const ms = Math.round(Number(match[1]) * unit);
  const minMs = options?.minMs ?? 0;
  const maxMs = options?.maxMs ?? SET_TIMEOUT_MAX_MS;
  if (ms < minMs) {
    throw new Error(`${name}: duration "${value}" is ${ms} ms, below the minimum of ${minMs} ms`);
  }
  if (ms > maxMs) {
    throw new Error(`${name}: duration "${value}" is ${ms} ms, above the maximum of ${maxMs} ms`);
  }
  return ms;
}
