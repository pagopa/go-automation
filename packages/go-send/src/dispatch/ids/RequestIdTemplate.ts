/** Placeholders of the template, besides `{col:<column>}`. */
const VARIABLES: ReadonlySet<string> = new Set(['runId', 'rowKey', 'rowIndex', 'attempt']);
const PLACEHOLDER = /\{([^{}]+)\}/g;
const COLUMN_PREFIX = 'col:';

/** Default template of the `direct` requestId (§6.3). */
export const DEFAULT_DIRECT_REQUEST_ID_TEMPLATE = 'PNMAN.GO-{runId}.{rowKey}.PCRETRY_0';

/**
 * Deterministic `requestId` template of the `direct` mode (§6.3).
 *
 * Placeholders: `{runId}`, `{rowKey}`, `{rowIndex}`, `{attempt}` and
 * `{col:<column>}` (value of an input column). Validated once, at parse time:
 * an unknown placeholder is a configuration error, not a wrong id later.
 */
export class RequestIdTemplate {
  private constructor(public readonly template: string) {}

  /**
   * Parses and validates a template.
   *
   * @param template - Template text
   * @returns The template
   * @throws Error naming the unknown placeholder
   */
  public static parse(template: string): RequestIdTemplate {
    if (template.trim() === '') throw new Error('direct.request.id.template: empty template');
    for (const match of template.matchAll(PLACEHOLDER)) {
      const name = match[1] ?? '';
      if (!VARIABLES.has(name) && !(name.startsWith(COLUMN_PREFIX) && name.length > COLUMN_PREFIX.length)) {
        throw new Error(`direct.request.id.template: unknown placeholder {${name}}`);
      }
    }
    return new RequestIdTemplate(template);
  }

  /**
   * Renders the requestId of a row. Pure.
   *
   * @param runId - Run id
   * @param rowKey - Row key
   * @param rowIndex - Position in the input
   * @param columns - Raw values of the row (for `{col:…}`)
   * @param attempt - Attempt number (default 0)
   * @returns The requestId
   */
  public render(
    runId: string,
    rowKey: string,
    rowIndex: number,
    columns: Readonly<Record<string, string>>,
    attempt: number = 0,
  ): string {
    return this.template.replace(PLACEHOLDER, (_match: string, name: string): string => {
      switch (name) {
        case 'runId':
          return runId;
        case 'rowKey':
          return rowKey;
        case 'rowIndex':
          return String(rowIndex);
        case 'attempt':
          return String(attempt);
        default:
          return columns[name.slice(COLUMN_PREFIX.length)]?.trim() ?? '';
      }
    });
  }

  /**
   * Columns of the `{col:…}` placeholders that are missing or blank in a row:
   * such a row would render a requestId shared with other rows. Pure.
   *
   * @param columns - Raw values of the row
   * @returns Names of the empty columns (empty when the row is complete)
   */
  public emptyColumns(columns: Readonly<Record<string, string>>): ReadonlyArray<string> {
    const empty: string[] = [];
    for (const match of this.template.matchAll(PLACEHOLDER)) {
      const name = match[1] ?? '';
      if (!name.startsWith(COLUMN_PREFIX)) continue;
      const column = name.slice(COLUMN_PREFIX.length);
      if ((columns[column]?.trim() ?? '') === '') empty.push(column);
    }
    return empty;
  }
}
