/** Placeholders of the template, besides `{col:<column>}`. */
const VARIABLES: ReadonlySet<string> = new Set(['runId', 'rowKey', 'rowIndex', 'attempt']);
/** Placeholders that differ from row to row: at least one is required. */
const ROW_VARIABLES: ReadonlySet<string> = new Set(['rowKey', 'rowIndex']);
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
  private constructor(
    public readonly template: string,
    /** Columns of the `{col:…}` placeholders, in template order, without duplicates. */
    private readonly columns: ReadonlyArray<string>,
  ) {}

  /**
   * Parses and validates a template.
   *
   * The template must contain at least one placeholder that differs between
   * rows (`{rowKey}`, `{rowIndex}` or `{col:…}`): otherwise every row of the
   * run would get the same requestId.
   *
   * @param template - Template text
   * @returns The template
   * @throws Error naming the unknown placeholder, or when no placeholder is row-specific
   */
  public static parse(template: string): RequestIdTemplate {
    if (template.trim() === '') throw new Error('direct.request.id.template: empty template');
    const columns = new Set<string>();
    let rowSpecific = false;
    for (const match of template.matchAll(PLACEHOLDER)) {
      const name = match[1] ?? '';
      if (name.startsWith(COLUMN_PREFIX) && name.length > COLUMN_PREFIX.length) {
        columns.add(name.slice(COLUMN_PREFIX.length));
        rowSpecific = true;
      } else if (VARIABLES.has(name)) {
        rowSpecific ||= ROW_VARIABLES.has(name);
      } else {
        throw new Error(`direct.request.id.template: unknown placeholder {${name}}`);
      }
    }
    if (!rowSpecific) {
      throw new Error(
        `direct.request.id.template: "${template}" has no row-specific placeholder ` +
          '({rowKey}, {rowIndex} or {col:<column>}): every row would share the same requestId',
      );
    }
    return new RequestIdTemplate(template, [...columns]);
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
    return this.columns.filter((column) => (columns[column]?.trim() ?? '') === '');
  }
}
