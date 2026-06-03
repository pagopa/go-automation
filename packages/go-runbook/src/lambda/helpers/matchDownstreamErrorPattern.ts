import type { DownstreamErrorPattern } from '../types/DownstreamErrorPattern.js';

/**
 * Returns the first downstream target whose pattern matches the message.
 *
 * @param message - The Lambda error message
 * @param patterns - Source-controlled downstream error patterns
 * @returns The matched target name, or `undefined`
 */
export function matchDownstreamErrorPattern(
  message: string,
  patterns: ReadonlyArray<DownstreamErrorPattern>,
): string | undefined {
  for (const entry of patterns) {
    let regex: RegExp;
    try {
      regex = new RegExp(entry.pattern, 'i');
    } catch {
      continue;
    }
    if (regex.test(message)) return entry.target;
  }
  return undefined;
}
