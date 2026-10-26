/** An operator field; vars references also populate details.diagnostics with the declared type. */
interface RunbookOutputField {
  readonly name: string;
  readonly label: string;
  readonly ref: `vars.${string}` | `params.${string}`;
  readonly valueType: 'string' | 'integer';
}

/** Family-independent output for runbooks with custom diagnostic steps. */
export interface RunbookOutputDefinition {
  readonly fields: ReadonlyArray<RunbookOutputField>;
  /** Static source/correlation information, separate from observed diagnostic values. */
  readonly metadata?: Readonly<Record<string, string>>;
}
