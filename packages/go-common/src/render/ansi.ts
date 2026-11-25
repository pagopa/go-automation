/**
 * ANSI helpers for console output.
 *
 * Centralizes ANSI escape handling so console output stays clean in non-terminal
 * contexts (AWS Lambda / CloudWatch, CI, pipes), where raw escape sequences would
 * otherwise show up as `[37m`-style noise.
 */

// Matches ANSI escape sequences: ESC, '[', optional numeric parameters, final letter.
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Remove ANSI escape codes (colors, cursor moves) from text.
 *
 * @param text - Text possibly containing ANSI escape sequences
 * @returns The text with all ANSI sequences removed
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

/**
 * Whether ANSI colors should be emitted to the console.
 *
 * Resolution order:
 * 1. `NO_COLOR` set (any value) → disabled (https://no-color.org).
 * 2. `FORCE_COLOR` set → enabled, unless it is `0`/`false`.
 * 3. Otherwise enabled only on an interactive stdout TTY.
 *
 * In AWS Lambda / CI / piped output stdout is not a TTY, so colors are disabled
 * and logs stay free of escape sequences.
 *
 * @returns True if colored output should be produced
 */
export function consoleColorsEnabled(): boolean {
  if (process.env['NO_COLOR'] !== undefined) {
    return false;
  }

  const forceColor = process.env['FORCE_COLOR'];
  if (forceColor !== undefined) {
    return forceColor !== '0' && forceColor.toLowerCase() !== 'false';
  }

  return process.stdout.isTTY === true;
}
