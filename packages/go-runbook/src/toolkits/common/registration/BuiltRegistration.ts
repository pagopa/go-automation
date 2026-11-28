import type { Runbook } from '../../../engine/index.js';
import type { RunbookKind } from './RunbookKind.js';
import type { RunbookProduct } from './RunbookProduct.js';

/** A runbook of the catalog built from its registration, with the product and the family the registration declares. */
export interface BuiltRegistration {
  readonly runbook: Runbook;
  readonly product: RunbookProduct;
  readonly kind: RunbookKind;
}
