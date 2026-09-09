import type { RunbookReporter } from '../RunbookReporter.js';

/**
 * Reporter that drops everything.
 *
 * Used where a runbook runs without a console — the Lambda worker, most tests —
 * so that steps never have to guard their reporting with a `logger !== undefined`
 * check.
 */
export const NOOP_RUNBOOK_REPORTER: RunbookReporter = {
  section(): void {
    // no console attached
  },
  add(): void {
    // no console attached
  },
  flush(): void {
    // no console attached
  },
};
