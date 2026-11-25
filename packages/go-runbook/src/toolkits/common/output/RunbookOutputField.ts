/** An operator field; vars references also populate details.diagnostics with the declared type. */
export interface RunbookOutputField {
  readonly name: string;
  readonly label: string;
  readonly ref: `vars.${string}` | `params.${string}`;
  readonly valueType: 'string' | 'integer';
}
