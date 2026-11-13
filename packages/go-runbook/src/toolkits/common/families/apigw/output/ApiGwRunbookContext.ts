import { isNonBlankString, isPlainObject } from '@pagopa/go-common/utils';
import { isRunbookProduct } from '../../../registration/isRunbookProduct.js';
import type { RunbookProduct } from '../../../registration/RunbookProduct.js';
import type { ApiGwService } from '../types/ApiGwService.js';

export interface ApiGwRunbookContext {
  readonly kind: 'apigw';
  /** Product whose pipeline built the runbook: selects the product-specific summaries (EVO-RBREORG-OPUS-01 P19). */
  readonly product: RunbookProduct;
  readonly services: ReadonlyArray<ApiGwService>;
  readonly apiGwLogGroup: string;
  readonly queryProfileId: string;
}

export function isApiGwRunbookContext(value: unknown): value is ApiGwRunbookContext {
  if (!isPlainObject(value)) return false;
  if (value['kind'] !== 'apigw') return false;
  if (!isRunbookProduct(value['product'])) return false;
  if (!isNonBlankString(value['apiGwLogGroup'])) return false;
  if (!isNonBlankString(value['queryProfileId'])) return false;
  const services = value['services'];
  return Array.isArray(services) && services.every(isApiGwService);
}

function isApiGwService(value: unknown): value is ApiGwService {
  if (!isPlainObject(value)) return false;
  return isNonBlankString(value['name']) && isNonBlankString(value['varPrefix']) && isNonBlankString(value['logGroup']);
}
