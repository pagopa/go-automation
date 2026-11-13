import { isNonBlankString, isPlainObject } from '@pagopa/go-common/utils';
import { isRunbookProduct } from '../../../registration/isRunbookProduct.js';
import type { RunbookProduct } from '../../../registration/RunbookProduct.js';
import type { ServiceDescriptor } from '../types/ServiceDescriptor.js';

export interface ServiceRunbookContext {
  readonly kind: 'service';
  /** Product whose pipeline built the runbook: selects the product-specific summaries (EVO-RBREORG-OPUS-01 P19). */
  readonly product: RunbookProduct;
  readonly service: ServiceDescriptor;
  readonly queryProfileId: string;
}

export function isServiceRunbookContext(value: unknown): value is ServiceRunbookContext {
  if (!isPlainObject(value)) return false;
  if (value['kind'] !== 'service') return false;
  if (!isRunbookProduct(value['product'])) return false;
  if (!isNonBlankString(value['queryProfileId'])) return false;

  const service = value['service'];
  return (
    isPlainObject(service) &&
    isNonBlankString(service['name']) &&
    isNonBlankString(service['logGroup']) &&
    isNonBlankString(service['varPrefix'])
  );
}
