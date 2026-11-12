/**
 * Programmatic API of `go-analyze-alarm` for in-process reuse.
 *
 * Importing this module does NOT bootstrap the CLI (unlike the package root
 * `index.ts`, which runs the script on import).
 *
 * @deprecated Import the shared catalog directly from
 * `@pagopa/go-runbook/catalog`.
 */
export {
  RUNBOOK_CATALOG,
  RunbookCatalog,
  RUNBOOK_REGISTRY,
  validateCloudRunbookRegistry,
  executeRunbookForOccurrence,
  createServiceRegistry,
  computeRunbookTimeRange,
  resolveOccurrenceTimeWindow,
  DEFAULT_OCCURRENCE_TIME_WINDOW,
  DEFAULT_TIME_WINDOW_MINUTES,
} from '@pagopa/go-runbook/catalog';
export type {
  RunbookRegistration,
  ResolvedRunbook,
  RunbookBuilderFn,
  ExecuteRunbookForOccurrenceDeps,
  ExecuteRunbookForOccurrenceInput,
  OccurrenceTimeWindow,
} from '@pagopa/go-runbook/catalog';
