/** An application log row read once: fields, representative message and level signals. */
export interface ServiceLogRow {
  /** Fields of the row, first value per name. */
  readonly fields: ReadonlyMap<string, string>;
  /** Message read from the schema's candidate fields, `''` when absent. */
  readonly message: string;
  /** Lower-cased level field, `''` when absent. */
  readonly level: string;
  /** The level says error or warning. */
  readonly isErrorLevel: boolean;
  /** The message contains one of the error keywords. */
  readonly hasErrorKeyword: boolean;
}
