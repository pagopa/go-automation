/**
 * Interpolates `{{vars.name}}` and `{{params.name}}` placeholders.
 * Missing placeholders are deliberately kept unchanged to preserve the
 * current ActionExecutor behavior.
 */
export function interpolateMessage(
  template: string,
  values: {
    readonly vars: ReadonlyMap<string, string>;
    readonly params: ReadonlyMap<string, string>;
  },
): string {
  return template.replace(/\{\{(vars|params)\.([^}]+)\}\}/g, (match: string, source: string, key: string) => {
    if (source === 'vars') {
      return values.vars.get(key) ?? `{{vars.${key}}}`;
    }
    if (source === 'params') {
      return values.params.get(key) ?? `{{params.${key}}}`;
    }
    return match;
  });
}
