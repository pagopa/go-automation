import { isNonBlankString, isPlainObject } from '@pagopa/go-common/utils';
import { isRunbookProduct } from '../../../registration/isRunbookProduct.js';
import type { RunbookProduct } from '../../../registration/RunbookProduct.js';
import type { ApiGwService } from '../types/ApiGwService.js';

export interface ApiGwRunbookContext {
  readonly kind: 'apigw';
  /** Product whose pipeline built the runbook: selects the product-specific summaries. */
  readonly product: RunbookProduct;
  readonly services: ReadonlyArray<ApiGwService>;
  readonly apiGwLogGroup: string;
  readonly queryProfileId: string;
  readonly traceIdVar?: string;
  readonly traceIdLabel?: string;
}

/**
 * Whether a runbook context is the one an API Gateway pipeline declares.
 *
 * @param value - The `runbookContext` of a runbook
 * @returns `true` when the value is an {@link ApiGwRunbookContext}
 */
export function isApiGwRunbookContext(value: unknown): value is ApiGwRunbookContext {
  if (!isPlainObject(value)) return false;
  if (value['kind'] !== 'apigw') return false;
  if (!isRunbookProduct(value['product'])) return false;
  if (!isNonBlankString(value['apiGwLogGroup'])) return false;
  if (!isNonBlankString(value['queryProfileId'])) return false;
  if (!isOptionalNonBlankString(value['traceIdVar']) || !isOptionalNonBlankString(value['traceIdLabel'])) return false;
  const services = value['services'];
  return Array.isArray(services) && services.every(isApiGwService);
}

function isApiGwService(value: unknown): value is ApiGwService {
  if (!isPlainObject(value)) return false;
  return isNonBlankString(value['name']) && isNonBlankString(value['varPrefix']) && isNonBlankString(value['logGroup']);
}

function isOptionalNonBlankString(value: unknown): boolean {
  return value === undefined || isNonBlankString(value);
}
