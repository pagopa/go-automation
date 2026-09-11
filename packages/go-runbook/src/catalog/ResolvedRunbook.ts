import type { RunbookDescriptor } from './RunbookDescriptor.js';

import type { RunbookProduct } from '../types/RunbookProduct.js';
import type { RunbookBuilderFn } from './RunbookBuilderFn.js';

/** A registration paired with the descriptor computed from its built runbook. */
export interface ResolvedRunbook {
  readonly descriptor: RunbookDescriptor;
  readonly product: RunbookProduct;
  readonly build: RunbookBuilderFn;
}
