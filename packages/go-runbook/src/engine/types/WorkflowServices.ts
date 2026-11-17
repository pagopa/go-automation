import type { RunbookReporter } from '../reporting/RunbookReporter.js';

/**
 * Services every workflow receives: only the reporter. Operational toolkits
 * extend it with their ports.
 */
export interface WorkflowServices {
  /** Narrative of the execution. */
  readonly reporter: RunbookReporter;
}
