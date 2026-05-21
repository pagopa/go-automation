import type { RunbookContext } from '../../types/RunbookContext.js';
import { interpolatePlaceholders } from '../../core/templatePlaceholders.js';

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
  const query = interpolatePlaceholders(
    template,
    { vars: context.vars, params: context.params },
    {
      escape: (value) => {
        parameters.push(value);
        return '?';
      },
    },
  );

  return { query, parameters };
}
