/**
 * The automatic-runbook registry of this inventory: the catalog instance and
 * the compatibility views used by the CLI, the worker and the descriptor export.
 */
import { assertCloudExecutableRunbook } from '../../toolkits/common/policies/assertCloudExecutableRunbook.js';
import { INVENTORY_MANIFEST } from '../manifest.js';
import { DOWNSTREAM_CATALOGS } from '../validation/DOWNSTREAM_CATALOGS.js';
import { RunbookCatalog } from '../../toolkits/common/registration/RunbookCatalog.js';
import type { RunbookBuilderFn } from '../../toolkits/common/registration/RunbookBuilderFn.js';

export const RUNBOOK_CATALOG: RunbookCatalog = new RunbookCatalog(INVENTORY_MANIFEST, {
  downstreamCatalogs: DOWNSTREAM_CATALOGS,
});

/** Compatibility map for existing local consumers; new code should use RUNBOOK_CATALOG. */
export const RUNBOOK_REGISTRY: ReadonlyMap<string, RunbookBuilderFn> = new Map(
  INVENTORY_MANIFEST.flatMap((entry) => entry.alarmNames.map((alarmName) => [alarmName, entry.build] as const)),
);

/** Compatibility wrapper used by existing CI checks. */
export function validateCloudRunbookRegistry(registry: ReadonlyMap<string, RunbookBuilderFn> = RUNBOOK_REGISTRY): void {
  if (registry === RUNBOOK_REGISTRY) {
    RUNBOOK_CATALOG.validateForCloud();
    return;
  }
  for (const [alarmName, buildRunbook] of registry) {
    try {
      assertCloudExecutableRunbook(buildRunbook());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Cloud runbook registry rejected "${alarmName}": ${message}`, { cause: error });
    }
  }
}
