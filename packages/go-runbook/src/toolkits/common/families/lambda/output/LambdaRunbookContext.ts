import { isNonBlankString, isPlainObject } from '@pagopa/go-common/utils';
import { isRunbookProduct } from '../../../registration/isRunbookProduct.js';
import type { RunbookProduct } from '../../../registration/RunbookProduct.js';
import type { LambdaFunction } from '../types/LambdaFunction.js';
import type { LambdaDownstream } from '../types/LambdaDownstream.js';

/**
 * Structured context attached to a Lambda runbook, used for polymorphic
 * output/summary dispatch. Mirrors `apigw.ApiGwRunbookContext`.
 */
export interface LambdaRunbookContext {
  readonly kind: 'lambda';
  /** Product whose pipeline built the runbook: selects the product-specific summaries (EVO-RBREORG-OPUS-01 P19). */
  readonly product: RunbookProduct;
  readonly lambda: LambdaFunction;
  readonly downstreams: ReadonlyArray<LambdaDownstream>;
  readonly queryProfileId: string;
}

/**
 * Type guard recognising a {@link LambdaRunbookContext}. Used by
 * `buildLambdaOutputContext` and the analyzer's polymorphic dispatch.
 *
 * @param value - The runbook `runbookContext` value
 * @returns `true` when the value is a Lambda runbook context
 */
export function isLambdaRunbookContext(value: unknown): value is LambdaRunbookContext {
  if (!isPlainObject(value)) return false;
  if (value['kind'] !== 'lambda') return false;
  if (!isRunbookProduct(value['product'])) return false;
  if (!isNonBlankString(value['queryProfileId'])) return false;
  const lambda = value['lambda'];
  if (!isPlainObject(lambda) || !isNonBlankString(lambda['name']) || !isNonBlankString(lambda['logGroup']))
    return false;
  return Array.isArray(value['downstreams']);
}
