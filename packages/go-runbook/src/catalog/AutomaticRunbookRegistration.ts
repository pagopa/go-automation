import type { AutomaticRunbookKind } from '@go-automation/go-execute-runbook-contracts';
import type { RunbookProduct } from '../types/RunbookProduct.js';
import type { RunbookBuilderFn } from './RunbookBuilderFn.js';

/** Catalog identity of a runbook, declared next to the runbook it describes. */
export interface AutomaticRunbookRegistration {
  readonly key: string;
  /** Watchtower product owning the alarms; selects the downstream catalog (§5.1.2). */
  readonly product: RunbookProduct;
  readonly alarmNames: readonly [string, ...string[]];
  readonly kind: AutomaticRunbookKind;
  readonly categories: readonly [string, ...string[]];
  readonly build: RunbookBuilderFn;
}
