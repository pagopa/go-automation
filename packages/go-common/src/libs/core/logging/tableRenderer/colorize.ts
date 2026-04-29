/**
 * Subset of color names we support for headers. Mirrors the legacy
 * `cli-table3` color contract so existing callers keep working.
 */
export type ChalkLikeColor = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray';

const ANSI_CODES = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
} as const satisfies Record<ChalkLikeColor, number>;

const RESET = '\x1b[0m';

/**
 * Wraps `text` in ANSI escape codes for the given color. Returns the
 * input unchanged when `color` is undefined (no-op for disabled colors).
 *
 * NOTE: returns RAW ANSI codes; `displayWidth` strips the codes via
 * `string-width` so column width math stays correct.
 */
export function colorize(text: string, color: ChalkLikeColor | undefined): string {
  if (color === undefined) return text;
  return `\x1b[${String(ANSI_CODES[color])}m${text}${RESET}`;
}
