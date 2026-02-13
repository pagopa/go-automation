import type { RunbookContext } from '../../types/RunbookContext.js';

/**
 * RegExp matching template placeholders in the form {{params.xxx}} or {{vars.xxx}}.
 * Compiled once and reused for all interpolation calls.
 */
const TEMPLATE_PATTERN = /\{\{(params|vars)\.([^}]+)\}\}/g;

/**
 * Interpolates template placeholders in a string using values from the runbook context.
 * Supports `{{params.xxx}}` and `{{vars.xxx}}` syntax.
 *
 * Unresolved placeholders are left unchanged to make debugging easier.
 *
 * @param template - The template string containing placeholders
 * @param context - The runbook execution context providing params and vars
 * @returns The interpolated string with resolved placeholders
 *
 * @example
 * ```typescript
 * const result = interpolateTemplate(
 *   'SELECT * FROM {{vars.tableName}} WHERE id = {{params.entityId}}',
 *   context,
 * );
 * ```
 */
export function interpolateTemplate(template: string, context: RunbookContext): string {
  return template.replace(TEMPLATE_PATTERN, (match, source: string, key: string) => {
    const store = source === 'params' ? context.params : context.vars;
    const value = store.get(key);
    return value ?? match;
  });
}
