import type { RunbookContext } from '../../types/RunbookContext.js';

/**
 * Builds a fresh RegExp for template placeholder matching.
 * Each call returns a new instance to avoid shared `/g` flag state across calls.
 */
function templatePattern(): RegExp {
  return /\{\{(params|vars)\.([^}]+)\}\}/g;
}

/**
 * Escapes a string value for safe inclusion in a SQL string literal.
 */
type EscapeFunction = (value: string) => string;

/**
 * Interpolates template placeholders in a string using values from the runbook context.
 * Supports `{{params.xxx}}` and `{{vars.xxx}}` syntax.
 *
 * Unresolved placeholders are left unchanged to make debugging easier.
 *
 * An optional `escape` function can be provided to sanitize values before substitution.
 * Each consumer should provide context-appropriate escaping (e.g. SQL escaping for queries,
 * `encodeURIComponent` for URLs). When omitted, values are substituted as-is.
 *
 * @param template - The template string containing placeholders
 * @param context - The runbook execution context providing params and vars
 * @param escape - Optional function to escape resolved values before substitution
 * @returns The interpolated string with resolved (and optionally escaped) placeholders
 *
 * @example
 * ```typescript
 * // Without escaping (safe contexts: log messages, notification text)
 * const msg = interpolateTemplate('Hello {{params.name}}', context);
 *
 * // With SQL escaping (query contexts)
 * const sql = interpolateTemplate(
 *   "SELECT * FROM t WHERE id = '{{params.id}}'",
 *   context,
 *   escapeSqlString,
 * );
 * ```
 */
export function interpolateTemplate(template: string, context: RunbookContext, escape?: EscapeFunction): string {
  return template.replace(templatePattern(), (match, source: string, key: string) => {
    const store = source === 'params' ? context.params : context.vars;
    const value = store.get(key);
    if (value === undefined) return match;
    return escape !== undefined ? escape(value) : value;
  });
}

/**
 * Escapes a string value for safe inclusion in a SQL string literal.
 * Replaces single quotes with doubled single quotes (standard SQL escaping)
 * and removes null bytes to prevent truncation attacks.
 *
 * @param value - The raw string value to escape
 * @returns The escaped string safe for SQL interpolation
 *
 * @example
 * ```typescript
 * escapeSqlString("O'Brien")  // "O''Brien"
 * escapeSqlString("'; DROP TABLE --")  // "''; DROP TABLE --"
 * ```
 */
export function escapeSqlString(value: string): string {
  return value.replace(/\0/g, '').replace(/'/g, "''");
}

/**
 * Data structure for extracted query and parameters from a template string.
 * The `query` has all template placeholders replaced with `?` positional parameters,
 * and `parameters` is an ordered array of the corresponding resolved values.
 */
interface ExtractedTemplate {
  readonly query: string;
  readonly parameters: ReadonlyArray<string>;
}

/**
 * Extracts all template placeholders from a string and returns their resolved values
 * as an ordered array, replacing each placeholder with a `?` positional parameter.
 *
 * Used by steps that support parameterized queries (e.g. Athena `ExecutionParameters`)
 * to separate the query structure from user-supplied values, preventing injection entirely.
 *
 * @param template - The template string containing placeholders
 * @param context - The runbook execution context providing params and vars
 * @returns ExtractedTemplate with the transformed query and ordered parameter values
 *
 * @example
 * ```typescript
 * const { query, parameters } = extractTemplateParameters(
 *   "SELECT * FROM t WHERE iun = '{{params.iun}}' AND status = '{{vars.status}}'",
 *   context,
 * );
 * // query: "SELECT * FROM t WHERE iun = ? AND status = ?"
 * // parameters: ['ABCD-1234', 'DELIVERED']
 * ```
 */
export function extractTemplateParameters(template: string, context: RunbookContext): ExtractedTemplate {
  const parameters: string[] = [];
  const query = template.replace(templatePattern(), (match, source: string, key: string) => {
    const store = source === 'params' ? context.params : context.vars;
    const value = store.get(key);
    if (value === undefined) return match;
    parameters.push(value);
    return '?';
  });

  return { query, parameters };
}
