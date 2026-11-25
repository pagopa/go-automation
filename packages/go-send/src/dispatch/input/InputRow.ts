/**
 * One row of the input, as read.
 */
export interface InputRow {
  /** Position in the input, 0-based. */
  readonly rowIndex: number;
  /** Flat values (nested JSON flattened with dots) used by the mapping. */
  readonly values: Readonly<Record<string, string>>;
  /** Original item, written back unchanged by the materializer. */
  readonly original: Readonly<Record<string, unknown>>;
}
