/**
 * Programmatic API of `go-analyze-alarm` for in-process reuse.
 *
 * Importing this module does NOT bootstrap the CLI (unlike the package root
 * `index.ts`, which runs the script on import).
 *
 * @deprecated Import the shared catalog directly from
 * `@go-automation/go-runbook/catalog`.
 */
export {
  AUTOMATIC_RUNBOOK_REGISTRY,
  AutomaticRunbookRegistry,
  RUNBOOK_REGISTRY,
  validateCloudRunbookRegistry,
  executeRunbookForOccurrence,
  createServiceRegistry,
  DEFAULT_TIME_WINDOW_MINUTES,
} from '@go-automation/go-runbook/catalog';
export type {
  AutomaticRunbookRegistration,
  ResolvedAutomaticRunbook,
  RunbookBuilderFn,
  ExecuteRunbookForOccurrenceDeps,
  ExecuteRunbookForOccurrenceInput,
} from '@go-automation/go-runbook/catalog';
