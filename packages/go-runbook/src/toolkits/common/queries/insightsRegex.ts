import { traceIdForms } from '../parsing/traceIds/traceIdentity.js';

/** The characters with a meaning in a regex of CloudWatch Logs Insights, the `/` delimiter included. */
const REGEX_SPECIAL = /[\\^$.|?*+()[\]{}/]/gu;

/**
 * A text as a literal in a regex of CloudWatch Logs Insights (`@message like /…/`).
 *
 * @param value - The text to search
 * @returns The text with every special character escaped
 *
 * @example
 * ```typescript
 * escapeInsightsRegex('a.b/c'); // 'a\\.b\\/c'
 * ```
 */
export function escapeInsightsRegex(value: string): string {
  return value.replace(REGEX_SPECIAL, (char) => `\\${char}`);
}

/**
 * One regex that finds, as a substring and with the case as written, every form a read searches for each trace id
 * (`traceIdForms`: the value as received and the forms of its format, for X-Ray the canonical and the compact one),
 * each as a literal. It finds the same rows as one `like` per form, in a shorter query, and every trace stays
 * readable in the query.
 *
 * Complexity: O(T) over the trace ids.
 *
 * @param traceIds - The trace ids of a batch, at least one
 * @returns The source of the regex, without delimiters
 *
 * @example
 * ```typescript
 * traceIdsInsightsPattern(['1-6ade89e7-1881f1cf24c5edf61cb105cf']);
 * // '1-6ade89e7-1881f1cf24c5edf61cb105cf|6ade89e71881f1cf24c5edf61cb105cf'
 * ```
 */
export function traceIdsInsightsPattern(traceIds: ReadonlyArray<string>): string {
  return [...new Set(traceIds.flatMap((traceId) => traceIdForms(traceId)))].map(escapeInsightsRegex).join('|');
}
