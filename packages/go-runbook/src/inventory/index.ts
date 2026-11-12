/**
 * @pagopa/go-runbook/inventory — the concrete runbooks and their registry.
 *
 * `RUNBOOK_CATALOG.resolveByAlarmName` tells whether an alarm has a runbook;
 * `RUNBOOK_CATALOG.listDescriptors` describes the registered runbooks.
 */

export {
  RUNBOOK_CATALOG,
  RunbookCatalog,
  RUNBOOK_REGISTRY,
  validateCloudRunbookRegistry,
} from '../catalog/RunbookCatalog.js';
export type { RunbookRegistration } from '../catalog/RunbookRegistration.js';
export type { ResolvedRunbook } from '../catalog/ResolvedRunbook.js';
export type { RunbookBuilderFn } from '../catalog/RunbookBuilderFn.js';
export type { RunbookDescriptor } from '../catalog/RunbookDescriptor.js';
export type { RunbookKind } from '../types/RunbookKind.js';
export { RunbookKinds } from '../types/RunbookKind.js';
