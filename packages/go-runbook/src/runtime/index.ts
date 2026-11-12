/**
 * @pagopa/go-runbook/runtime — execution of a runbook for one alarm occurrence.
 *
 * Composition root: builds the service registry from go-aws services, binds it
 * to an occurrence and runs the registered runbook.
 */

export { executeRunbookForOccurrence } from '../catalog/executeRunbookForOccurrence.js';
export type {
  ExecuteRunbookForOccurrenceDeps,
  ExecuteRunbookForOccurrenceInput,
} from '../catalog/executeRunbookForOccurrence.js';
export { bindServicesToOccurrence } from './bindServicesToOccurrence.js';
export type { BindServicesToOccurrenceOptions } from './BindServicesToOccurrenceOptions.js';
export type { OccurrenceServiceBindingMode } from './OccurrenceServiceBindingMode.js';
export { buildCatalogOutputContext } from '../catalog/buildCatalogOutputContext.js';
export { createServiceRegistry, buildServiceRegistry } from '../catalog/createServiceRegistry.js';
export type { CreateServiceRegistryDeps } from '../catalog/CreateServiceRegistryDeps.js';
export type { RunbookReporter } from '../registry/RunbookReporter.js';
export { ConsoleRunbookReporter } from '../registry/reporters/ConsoleRunbookReporter.js';
export { NOOP_RUNBOOK_REPORTER } from '../registry/reporters/NOOP_RUNBOOK_REPORTER.js';
export { computeTimeRange } from '../catalog/computeTimeRange.js';
export { computeRunbookTimeRange, resolveOccurrenceTimeWindow } from '../catalog/computeRunbookTimeRange.js';
export { createTimeRangeReference } from '../catalog/createTimeRangeReference.js';
export type { TimeRangeReference } from '../catalog/TimeRangeReference.js';
export type { OccurrenceTimeWindow } from '../types/OccurrenceTimeWindow.js';
export { DEFAULT_OCCURRENCE_TIME_WINDOW, DEFAULT_TIME_WINDOW_MINUTES } from '../catalog/runbooks/constants.js';
