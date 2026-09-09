/**
 * Escaping for values interpolated into CloudWatch Logs Insights queries.
 *
 * Insights has two distinct literal syntaxes and they escape differently:
 * a double-quoted string (`filter cid = "…"`) and a slash-delimited regex
 * (`filter pod_app like /…/`). Using the wrong one either breaks the query
 * or, worse, lets a value change what the query matches.
 */

/** Characters that carry meaning inside a `/…/` regex literal. */
const REGEX_LITERAL_SPECIAL_CHARS: ReadonlySet<string> = new Set([
  '\\',
  '/',
  '[',
  ']',
  '{',
  '}',
  '(',
  ')',
  '*',
  '+',
  '?',
  '.',
  '^',
  '$',
  '|',
  '-',
]);

/**
 * Escapes a value for a double-quoted Insights string literal.
 *
 * Drops NUL, which Insights rejects outright, then escapes backslashes and
 * double quotes so the value cannot terminate the literal early.
 *
 * @param value - Raw value to embed
 * @returns The value, safe inside `"…"`
 *
 * @example
 * ```typescript
 * `filter cid = "${escapeLogsInsightsString(cid)}"`;
 * ```
 */
export function escapeLogsInsightsString(value: string): string {
  return value.replace(/\0/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Escapes a value for a slash-delimited Insights regex literal.
 *
 * Every regex metacharacter is escaped, so the value matches literally
 * rather than as a pattern: a service name containing `.` or `-` must not
 * silently widen what the filter matches.
 *
 * @param value - Raw value to embed
 * @returns The value, safe inside `/…/`
 *
 * @example
 * ```typescript
 * `filter pod_app like /${escapeLogsInsightsRegexLiteral(podApp)}/`;
 * ```
 */
export function escapeLogsInsightsRegexLiteral(value: string): string {
  const escaped: string[] = [];
  for (const char of value) {
    escaped.push(REGEX_LITERAL_SPECIAL_CHARS.has(char) ? `\\${char}` : char);
  }
  return escaped.join('');
}
