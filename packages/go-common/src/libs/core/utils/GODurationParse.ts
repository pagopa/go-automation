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
 * @param value - Duration text
 * @param name - Parameter name, for the error message
 * @returns Milliseconds
 * @throws Error when the format is not valid
 */
export function parseDuration(value: string, name: string): number {
  const match = DURATION.exec(value.trim());
  const unit = match?.[2] === undefined ? undefined : UNIT_MS.get(match[2]);
  if (match?.[1] === undefined || unit === undefined) {
    throw new Error(`${name}: invalid duration "${value}" (examples: 500ms, 10s, 15m, 2h)`);
  }
  return Math.round(Number(match[1]) * unit);
}
