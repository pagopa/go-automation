/**
 * Shared placeholder parser/interpolator for runbook templates.
 *
 * Supported placeholders:
 * - `{{params.name}}`
 * - `{{vars.name}}`
 *
 * Malformed or unsupported placeholders are preserved verbatim. When a
 * malformed placeholder contains another valid placeholder, scanning resumes
 * from the malformed opening delimiter so the inner one can still be resolved.
 */

type TemplatePlaceholderSource = 'params' | 'vars';

interface TemplatePlaceholderValues {
  readonly params: ReadonlyMap<string, string>;
  readonly vars: ReadonlyMap<string, string>;
}

interface TemplatePlaceholder {
  readonly raw: string;
  readonly source: TemplatePlaceholderSource;
  readonly key: string;
}

type TemplatePlaceholderTransformer = (placeholder: TemplatePlaceholder) => string;
type EscapeTransformer = (value: string) => string;

interface InterpolatePlaceholdersOptions {
  readonly escape?: EscapeTransformer;
  readonly missingValue?: string;
}

const TEMPLATE_START = '{{';
const TEMPLATE_END = '}}';
const PARAMS_PREFIX = 'params.';
const VARS_PREFIX = 'vars.';

function parseTemplatePlaceholder(body: string): Omit<TemplatePlaceholder, 'raw'> | undefined {
  if (body.startsWith(PARAMS_PREFIX)) {
    const key = body.slice(PARAMS_PREFIX.length);
    if (key !== '' && !key.includes('{') && !key.includes('}')) {
      return { source: 'params', key };
    }
  }

  if (body.startsWith(VARS_PREFIX)) {
    const key = body.slice(VARS_PREFIX.length);
    if (key !== '' && !key.includes('{') && !key.includes('}')) {
      return { source: 'vars', key };
    }
  }

  return undefined;
}

function getPlaceholderValue(
  values: TemplatePlaceholderValues,
  source: TemplatePlaceholderSource,
  key: string,
): string | undefined {
  const store = source === 'params' ? values.params : values.vars;
  return store.get(key);
}

function replaceTemplatePlaceholders(template: string, replace: TemplatePlaceholderTransformer): string {
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

export function interpolatePlaceholders(
  template: string,
  values: TemplatePlaceholderValues,
  options: InterpolatePlaceholdersOptions = {},
): string {
  return replaceTemplatePlaceholders(template, ({ raw, source, key }) => {
    const value = getPlaceholderValue(values, source, key);
    if (value === undefined) {
      return options.missingValue ?? raw;
    }
    return options.escape !== undefined ? options.escape(value) : value;
  });
}
