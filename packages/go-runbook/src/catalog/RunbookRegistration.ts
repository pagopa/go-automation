import type { RunbookKind } from '../types/RunbookKind.js';
import type { RunbookProduct } from '../types/RunbookProduct.js';
import type { RunbookBuilderFn } from './RunbookBuilderFn.js';

/** Catalog identity of a runbook, declared next to the runbook it describes. */
export interface RunbookRegistration {
  readonly key: string;
  /** Watchtower product owning the alarms; selects the downstream catalog (§5.1.2). */
  readonly product: RunbookProduct;
  readonly alarmNames: readonly [string, ...string[]];
  readonly kind: RunbookKind;
  readonly categories: readonly [string, ...string[]];
  readonly build: RunbookBuilderFn;
}
