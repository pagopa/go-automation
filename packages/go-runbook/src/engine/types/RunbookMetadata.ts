import type { RunbookType } from './RunbookType.js';

/**
 * Metadata describing a runbook definition.
 */
export interface RunbookMetadata {
  /** Unique identifier of the runbook */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Description of the runbook's purpose */
  readonly description: string;
  /** Semantic version */
  readonly version: string;
  /** Type of runbook */
  readonly type: RunbookType;
  /** Owning team */
  readonly team: string;
  /** Tags for categorization */
  readonly tags: ReadonlyArray<string>;
}
