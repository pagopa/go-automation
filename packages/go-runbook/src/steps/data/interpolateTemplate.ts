import type { RunbookContext } from '../../types/RunbookContext.js';

/**
 * Escapes a string value for safe inclusion in a SQL string literal.
 */
type EscapeTransformer = (value: string) => string;

type TemplatePlaceholderSource = 'params' | 'vars';

interface TemplatePlaceholder {
  readonly raw: string;
  readonly source: TemplatePlaceholderSource;
  readonly key: string;
}

const TEMPLATE_START = '{{';
const TEMPLATE_END = '}}';
const PARAMS_PREFIX = 'params.';
const VARS_PREFIX = 'vars.';

function parseTemplatePlaceholder(body: string): Omit<TemplatePlaceholder, 'raw'> | undefined {
  if (body.startsWith(PARAMS_PREFIX)) {
    const key = body.slice(PARAMS_PREFIX.length);
    if (key !== '') {
      return { source: 'params', key };
    }
  }

  if (body.startsWith(VARS_PREFIX)) {
    const key = body.slice(VARS_PREFIX.length);
    if (key !== '') {
      return { source: 'vars', key };
    }
  }

  return undefined;
}

function getPlaceholderValue(
  context: RunbookContext,
  source: TemplatePlaceholderSource,
  key: string,
): string | undefined {
  const store = source === 'params' ? context.params : context.vars;
  return store.get(key);
}

function replaceTemplatePlaceholders(template: string, replace: (placeholder: TemplatePlaceholder) => string): string {
  let result = '';
  let cursor = 0;

  while (cursor < template.length) {
    const start = template.indexOf(TEMPLATE_START, cursor);
    if (start === -1) {
      result += template.slice(cursor);
      break;
    }

    result += template.slice(cursor, start);

    const end = template.indexOf(TEMPLATE_END, start + TEMPLATE_START.length);
    if (end === -1) {
      result += template.slice(start);
      break;
    }

    const body = template.slice(start + TEMPLATE_START.length, end);
    const parsed = parseTemplatePlaceholder(body);

    if (parsed === undefined) {
      // Preserve malformed placeholders by treating the current opening braces
      // as literal text and continue scanning from the next character.
      result += TEMPLATE_START;
      cursor = start + TEMPLATE_START.length;
      continue;
    }

    const raw = template.slice(start, end + TEMPLATE_END.length);
    result += replace({ raw, ...parsed });
    cursor = end + TEMPLATE_END.length;
  }

  return result;
}

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
export function interpolateTemplate(template: string, context: RunbookContext, escape?: EscapeTransformer): string {
  return replaceTemplatePlaceholders(template, ({ raw, source, key }) => {
    const value = getPlaceholderValue(context, source, key);
    if (value === undefined) return raw;
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
  const query = replaceTemplatePlaceholders(template, ({ raw, source, key }) => {
    const value = getPlaceholderValue(context, source, key);
    if (value === undefined) return raw;
    parameters.push(value);
    return '?';
  });

  return { query, parameters };
}
