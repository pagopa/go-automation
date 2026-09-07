import type { RunbookProduct } from '@go-automation/go-runbook';
import type { AutomaticRunbookKind } from '@go-automation/go-runbook/catalog';

/**
 * Flattened view of a single runbook registered in the local catalog.
 *
 * It joins the registry metadata (product, kind, categories, alarm names) with
 * the shape of the built runbook (steps, known cases), so statistics can be
 * computed without touching AWS or Watchtower.
 */
export interface RunbookCatalogEntry {
  /** Registry key, equal to the runbook metadata id */
  readonly key: string;
  /** Human-readable runbook name */
  readonly name: string;
  /** Semantic version declared by the runbook metadata */
  readonly version: string;
  /** Product owning the alarms handled by the runbook */
  readonly product: RunbookProduct;
  /** Runbook family declared on the registry entry: `APIGW`, `LAMBDA` or `SERVICE` */
  readonly kind: AutomaticRunbookKind;
  /** Functional categories declared on the registry entry */
  readonly categories: ReadonlyArray<string>;
  /** Tags declared by the runbook metadata */
  readonly tags: ReadonlyArray<string>;
  /** CloudWatch alarm names routed to this runbook */
  readonly alarmNames: ReadonlyArray<string>;
  /** Number of steps in the runbook pipeline */
  readonly stepCount: number;
  /** Number of known cases evaluated at the end of the pipeline */
  readonly knownCaseCount: number;
  /** Known cases carrying analysis directives for Watchtower */
  readonly annotatedKnownCaseCount: number;
}
