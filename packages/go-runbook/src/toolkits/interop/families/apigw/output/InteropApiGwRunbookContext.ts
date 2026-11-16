import {
  isApiGwRunbookContext,
  type ApiGwRunbookContext,
} from '../../../../common/families/apigw/output/ApiGwRunbookContext.js';
import { RunbookProducts } from '../../../../common/registration/RunbookProduct.js';

/**
 * Context of an INTEROP API Gateway runbook: access log plus application log of
 * one service, without the SEND service chain (EVO-RBREORG-OPUS-01 P19).
 */
export interface InteropApiGwRunbookContext extends ApiGwRunbookContext {
  readonly product: typeof RunbookProducts.INTEROP;
}

/**
 * Type guard for {@link InteropApiGwRunbookContext}: an API Gateway context of the INTEROP product.
 *
 * @param value - The runbook `runbookContext`
 * @returns Whether the runbook is an INTEROP API Gateway runbook
 */
export function isInteropApiGwRunbookContext(value: unknown): value is InteropApiGwRunbookContext {
  return isApiGwRunbookContext(value) && value.product === RunbookProducts.INTEROP;
}
