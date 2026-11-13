/** Values a log action interpolates against. */
export interface LogActionValues {
  readonly vars: ReadonlyMap<string, string>;
  readonly params: ReadonlyMap<string, string>;
}
