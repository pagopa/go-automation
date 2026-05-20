/**
 * Interpolates `{{vars.name}}` and `{{params.name}}` placeholders.
 * Missing placeholders are kept unchanged by default to preserve the
 * historical ActionExecutor behavior. Callers rendering operator-facing
 * summaries can pass `missingValue` when an explicit placeholder is clearer.
 */
export function interpolateMessage(
  template: string,
  values: {
    readonly vars: ReadonlyMap<string, string>;
    readonly params: ReadonlyMap<string, string>;
  },
  options: { readonly missingValue?: string } = {},
): string {
  // The name class excludes both `}` (closing delimiter) and `{` (opening
  // delimiter of a nested placeholder). Excluding `{` is what guarantees
  // unambiguous match starts and prevents the polynomial ReDoS that arises
  // when an input like `{{vars.{{vars.{{vars....` lets the engine restart
  // the match at every inner `{{` (js/polynomial-redos).
  return template.replace(/\{\{(vars|params)\.([^}{]+)\}\}/g, (match: string, source: string, key: string) => {
    if (source === 'vars') {
      return values.vars.get(key) ?? options.missingValue ?? `{{vars.${key}}}`;
    }
    if (source === 'params') {
      return values.params.get(key) ?? options.missingValue ?? `{{params.${key}}}`;
    }
    return match;
  });
}
