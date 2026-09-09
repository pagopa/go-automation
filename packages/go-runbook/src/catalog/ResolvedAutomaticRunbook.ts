import type { AutomaticRunbookDescriptorV1 } from '@go-automation/go-execute-runbook-contracts';

import type { RunbookProduct } from '../types/RunbookProduct.js';
import type { RunbookBuilderFn } from './RunbookBuilderFn.js';

/** A registration paired with the descriptor computed from its built runbook. */
export interface ResolvedAutomaticRunbook {
  readonly descriptor: AutomaticRunbookDescriptorV1;
  readonly product: RunbookProduct;
  readonly build: RunbookBuilderFn;
}
