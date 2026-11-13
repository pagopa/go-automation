/**
 * Programmatic API of `go-analyze-alarm` for in-process reuse.
 *
 * Importing this module does NOT bootstrap the CLI (unlike the package root
 * `index.ts`, which runs the script on import).
 *
 * @deprecated Import the shared catalog directly from
 * `@pagopa/go-runbook/inventory` and `@pagopa/go-runbook/runtime`.
 */
export {
  RUNBOOK_CATALOG,
  RunbookCatalog,
  RUNBOOK_REGISTRY,
  validateCloudRunbookRegistry,
} from '@pagopa/go-runbook/inventory';
export {
  executeRunbookForOccurrence,
  createServiceRegistry,
  computeRunbookTimeRange,
  resolveOccurrenceTimeWindow,
  DEFAULT_OCCURRENCE_TIME_WINDOW,
  DEFAULT_TIME_WINDOW_MINUTES,
} from '@pagopa/go-runbook/runtime';
export type { RunbookRegistration, ResolvedRunbook, RunbookBuilderFn } from '@pagopa/go-runbook/inventory';
export type {
  ExecuteRunbookForOccurrenceDeps,
  ExecuteRunbookForOccurrenceInput,
  OccurrenceTimeWindow,
} from '@pagopa/go-runbook/runtime';
