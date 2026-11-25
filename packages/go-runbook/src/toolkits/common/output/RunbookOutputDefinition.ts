import type { RunbookOutputField } from './RunbookOutputField.js';

/** Family-independent output for runbooks with custom diagnostic steps. */
export interface RunbookOutputDefinition {
  readonly fields: ReadonlyArray<RunbookOutputField>;
  /** Static source/correlation information, separate from observed diagnostic values. */
  readonly metadata?: Readonly<Record<string, string>>;
}
