/**
 * Parsing of numeric values arriving as strings (CLI arguments, environment
 * variables, HTTP headers, CloudWatch fields, database columns).
 *
 * Both helpers reject a value that is not entirely numeric: `'12abc'` yields
 * `undefined`, never `12`. A prefix parse silently invents a number that was
 * never in the input, which is the wrong default for configuration and
 * telemetry.
 */

/**
 * Parses a string as a whole number.
 *
 * @param value - Raw value; trimmed before parsing
 * @returns The integer, or `undefined` when absent, blank, fractional or not
 *   entirely numeric
 *
 * @example
 * ```typescript
 * parseInteger(' 12 ');  // 12
 * parseInteger('12abc'); // undefined
 * parseInteger('1.5');   // undefined
 * ```
 */
export function parseInteger(value: string | undefined): number | undefined {
  const parsed = parseFiniteNumber(value);
  if (parsed === undefined) return undefined;
  return Number.isInteger(parsed) ? parsed : undefined;
}

/**
 * Parses a string as a finite number, integral or fractional.
 *
 * `Infinity` and `NaN` are rejected: they are not usable as metrics,
 * thresholds or durations.
 *
 * @param value - Raw value; trimmed before parsing
 * @returns The number, or `undefined` when absent, blank, non-finite or not
 *   entirely numeric
 *
 * @example
 * ```typescript
 * parseFiniteNumber('1.5');      // 1.5
 * parseFiniteNumber('Infinity'); // undefined
 * ```
 */
export function parseFiniteNumber(value: string | undefined): number | undefined {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
