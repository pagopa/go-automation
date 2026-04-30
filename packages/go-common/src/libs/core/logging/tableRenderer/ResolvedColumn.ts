/** Resolved value-to-string formatter (custom or default) */
type ResolvedColumnFormatter = (value: unknown) => string;

/**
 * A column after defaults have been applied and dimensions resolved.
 *
 * Decoupled from the public `GOTableColumn` so internal helpers don't have
 * to handle optional fields repeatedly. Every field is non-optional here.
 */
export interface ResolvedColumn {
  /** Column header text (single-line, must not contain `\n`) */
  readonly header: string;

  /** Key used to extract the cell value from each row */
  readonly key: string;

  /** Total column width including the 2-char inner padding */
  readonly width: number;

  /** Text alignment within the cell */
  readonly align: 'left' | 'right' | 'center';

  /** Resolved value-to-string formatter (custom or default) */
  readonly formatter: ResolvedColumnFormatter;
}
