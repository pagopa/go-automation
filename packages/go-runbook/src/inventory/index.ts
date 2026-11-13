/**
 * @pagopa/go-runbook/inventory — the concrete runbooks and their registry.
 *
 * `RUNBOOK_CATALOG.resolveByAlarmName` tells whether an alarm has a runbook;
 * `RUNBOOK_CATALOG.listDescriptors` describes the registered runbooks.
 */

export { RunbookCatalog } from '../toolkits/common/registration/RunbookCatalog.js';
export { RUNBOOK_CATALOG, RUNBOOK_REGISTRY, validateCloudRunbookRegistry } from './registry/runbookRegistry.js';
export type { RunbookRegistration } from '../toolkits/common/registration/RunbookRegistration.js';
export type { ResolvedRunbook } from '../toolkits/common/registration/ResolvedRunbook.js';
export type { RunbookBuilderFn } from '../toolkits/common/registration/RunbookBuilderFn.js';
export type { RunbookDescriptor } from '../toolkits/common/registration/RunbookDescriptor.js';
export type { RunbookKind } from '../toolkits/common/registration/RunbookKind.js';
export { RunbookKinds } from '../toolkits/common/registration/RunbookKind.js';

// Operational model augmentations: keeps the operational fields in a consumer's program (EVO-RBREORG-OPUS-01 RBREORG-11).
export type { OperationalModelAugmentations } from '../toolkits/common/augmentations/index.js';
