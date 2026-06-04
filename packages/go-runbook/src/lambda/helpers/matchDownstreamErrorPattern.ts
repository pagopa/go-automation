import type { ResultField } from '@go-automation/go-common/aws';

import type { DownstreamErrorPattern } from '../types/DownstreamErrorPattern.js';
import { extractField } from './extractField.js';

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

/** A downstream routing match: the routed target and the line that matched. */
export interface DownstreamMatch {
  readonly target: string;
  readonly message: string;
}

/**
 * Scans CloudWatch result rows for the first `@message` that matches a
 * downstream error pattern, returning the routed target and the matching
 * line. Unlike {@link matchDownstreamErrorPattern}, this lets routing
 * consider every row (the error scan or the full invocation flow), not just
 * a single representative message.
 *
 * @param rows - CloudWatch Logs Insights result rows
 * @param patterns - Source-controlled downstream error patterns
 * @returns The first match, or `undefined`
 */
export function findDownstreamInRows(
  rows: ReadonlyArray<ReadonlyArray<ResultField>>,
  patterns: ReadonlyArray<DownstreamErrorPattern>,
): DownstreamMatch | undefined {
  if (patterns.length === 0) return undefined;
  for (const row of rows) {
    const message = (extractField(row, '@message') ?? '').trim();
    if (message === '') continue;
    const target = matchDownstreamErrorPattern(message, patterns);
    if (target !== undefined) return { target, message };
  }
  return undefined;
}

/**
 * Returns whether a string compiles as a valid regular expression. Used by
 * build-time validation so an invalid downstream pattern fails loudly
 * instead of being silently ignored at runtime.
 *
 * @param pattern - Candidate regular expression source
 * @returns `true` when the pattern compiles
 */
export function isValidRegex(pattern: string): boolean {
  try {
    return Boolean(new RegExp(pattern));
  } catch {
    return false;
  }
}
