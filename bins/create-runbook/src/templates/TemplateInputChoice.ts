/**
 * A single option offered for a `select` template input.
 */
export interface TemplateInputChoice {
  /** Value stored in the answers and emitted into the generated code. */
  readonly value: string;
  /** Human-readable label shown in the interactive prompt. */
  readonly label: string;
}
