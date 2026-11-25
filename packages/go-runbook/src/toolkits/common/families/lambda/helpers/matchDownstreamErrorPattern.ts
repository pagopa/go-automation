import { readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { isValidRegex } from '@pagopa/go-common/utils';

import type { DownstreamErrorPattern } from '../types/DownstreamErrorPattern.js';
import type { DownstreamFinderFn } from '../types/DownstreamFinderFn.js';

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

/**
 * Binds the downstream patterns, compiled once, to a finder of the first `@message` of the rows that matches one of
 * them: routing considers every row (the error scan or the full invocation flow), not just a representative message.
 *
 * Complexity: O(P) to compile, then O(R × P) per call over R rows and P patterns.
 *
 * @param patterns - Source-controlled downstream error patterns
 * @returns The finder, returning the routed target and the matching line, or `undefined`
 *
 * @example
 * ```typescript
 * const findDownstream = downstreamFinder(patterns);
 * const target = findDownstream(rows)?.target;
 * ```
 */
export function downstreamFinder(patterns: ReadonlyArray<DownstreamErrorPattern>): DownstreamFinderFn {
  const compiled = compileDownstreamPatterns(patterns);
  return (rows) => {
    if (compiled.length === 0) return undefined;
    for (const row of rows) {
      const message = (readRowField(row, '@message') ?? '').trim();
      if (message === '') continue;
      const target = firstMatchingTarget(message, compiled);
      if (target !== undefined) return { target, message };
    }
    return undefined;
  };
}
