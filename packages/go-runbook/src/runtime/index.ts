/**
 * @pagopa/go-runbook/runtime — execution of a runbook for one alarm occurrence.
 *
 * Composition root: builds the service registry from go-aws services, binds it
 * to an occurrence and runs the registered runbook.
 */

export { executeRunbookForOccurrence } from './execution/executeRunbookForOccurrence.js';
export type {
  ExecuteRunbookForOccurrenceDeps,
  ExecuteRunbookForOccurrenceInput,
} from './execution/executeRunbookForOccurrence.js';
export { bindServicesToOccurrence } from './services/bindServicesToOccurrence.js';
export type { BindServicesToOccurrenceOptions } from './services/BindServicesToOccurrenceOptions.js';
export type { OccurrenceServiceBindingMode } from './services/OccurrenceServiceBindingMode.js';
export { buildCatalogOutputContext } from './execution/buildCatalogOutputContext.js';
export { createServiceRegistry, buildServiceRegistry } from './services/createServiceRegistry.js';
export type { CreateServiceRegistryDeps } from './services/CreateServiceRegistryDeps.js';
export { computeTimeRange } from '../toolkits/common/time/occurrence/computeTimeRange.js';
export {
  computeRunbookTimeRange,
  resolveOccurrenceTimeWindow,
} from '../toolkits/common/time/occurrence/computeRunbookTimeRange.js';
export { createTimeRangeReference } from '../toolkits/common/time/occurrence/createTimeRangeReference.js';
export type { TimeRangeReference } from '../toolkits/common/time/occurrence/TimeRangeReference.js';
export type { OccurrenceTimeWindow } from '../toolkits/common/time/occurrence/OccurrenceTimeWindow.js';
export {
  DEFAULT_OCCURRENCE_TIME_WINDOW,
  DEFAULT_TIME_WINDOW_MINUTES,
} from '../toolkits/common/time/occurrence/DEFAULT_OCCURRENCE_TIME_WINDOW.js';
