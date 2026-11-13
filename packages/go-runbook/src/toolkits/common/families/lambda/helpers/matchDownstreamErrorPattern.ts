import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { isValidRegex } from '@pagopa/go-common/utils';

import type { DownstreamErrorPattern } from '../types/DownstreamErrorPattern.js';

/** A downstream pattern compiled once, case-insensitive. */
interface CompiledDownstreamPattern {
  readonly target: string;
  readonly regex: RegExp;
}

/**
 * Compiles the downstream patterns once, skipping the invalid ones (build-time
 * validation rejects them; here they are ignored, as before).
 *
 * @param patterns - Source-controlled downstream error patterns
 * @returns The valid patterns, compiled case-insensitive, in declaration order
 */
function compileDownstreamPatterns(
  patterns: ReadonlyArray<DownstreamErrorPattern>,
): ReadonlyArray<CompiledDownstreamPattern> {
  return patterns
    .filter((entry) => isValidRegex(entry.pattern))
    .map((entry) => ({ target: entry.target, regex: new RegExp(entry.pattern, 'i') }));
}

/**
 * First target whose compiled pattern matches the message.
 *
 * @param message - The Lambda error message
 * @param compiled - Compiled downstream patterns
 * @returns The matched target name, or `undefined`
 */
function firstMatchingTarget(message: string, compiled: ReadonlyArray<CompiledDownstreamPattern>): string | undefined {
  return compiled.find((entry) => entry.regex.test(message))?.target;
}

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
  return firstMatchingTarget(message, compileDownstreamPatterns(patterns));
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
  rows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>,
  patterns: ReadonlyArray<DownstreamErrorPattern>,
): DownstreamMatch | undefined {
  if (patterns.length === 0) return undefined;
  const compiled = compileDownstreamPatterns(patterns);
  for (const row of rows) {
    const message = (readRowField(row, '@message') ?? '').trim();
    if (message === '') continue;
    const target = firstMatchingTarget(message, compiled);
    if (target !== undefined) return { target, message };
  }
  return undefined;
}
