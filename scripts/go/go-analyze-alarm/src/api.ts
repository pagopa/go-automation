/**
 * Programmatic API of `go-analyze-alarm` for in-process reuse.
 *
 * Importing this module does NOT bootstrap the CLI (unlike the package root
 * `index.ts`, which runs the script on import). Consumed by `go-rta-check`.
 */
export { RUNBOOK_REGISTRY } from './libs/runbookRegistry.js';
export { executeRunbookForOccurrence } from './libs/executeRunbookForOccurrence.js';
export type { ExecuteRunbookDeps, ExecuteRunbookInput } from './libs/executeRunbookForOccurrence.js';
export { createServiceRegistry } from './libs/createServiceRegistry.js';
export { DEFAULT_TIME_WINDOW_MINUTES } from './libs/runbooks/constants.js';
