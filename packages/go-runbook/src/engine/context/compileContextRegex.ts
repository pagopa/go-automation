import { compileRegex } from '@pagopa/go-common/utils';

import type { RunbookContext } from '../types/RunbookContext.js';

/**
 * Compiles a pattern with the regex cache of the engine that owns the context.
 * A context built by hand, without a cache, compiles
 * without caching.
 *
 * @param context - The current runbook context
 * @param pattern - Regular expression source
 * @returns The compiled expression
 * @throws Error naming the pattern when it is invalid
 */
export function compileContextRegex(context: RunbookContext, pattern: string): RegExp {
  return context.regexCache?.compile(pattern) ?? compileRegex(pattern);
}
