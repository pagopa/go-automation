import type { ConsoleRunbookReporter } from '../../engine/reporting/ConsoleRunbookReporter.js';

/** A console reporter whose rendered lines are collected in memory. */
export interface CapturedNarrative {
  readonly reporter: ConsoleRunbookReporter;
  /** Lines written so far; the reporter holds the last node back until `flush()`. */
  readonly lines: string[];
}
