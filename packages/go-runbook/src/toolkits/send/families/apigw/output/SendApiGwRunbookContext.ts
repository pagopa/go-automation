import {
  isApiGwRunbookContext,
  type ApiGwRunbookContext,
} from '../../../../common/families/apigw/output/ApiGwRunbookContext.js';
import { RunbookProducts } from '../../../../common/registration/RunbookProduct.js';

/**
 * Context of a runbook built by the SEND API Gateway pipeline
 * (`createSendApiGwAlarmRunbook`): the one whose service chain the SEND summary reads
 * (EVO-RBREORG-OPUS-01 P19).
 */
export interface SendApiGwRunbookContext extends ApiGwRunbookContext {
  readonly product: typeof RunbookProducts.SEND;
}

/**
 * Type guard for {@link SendApiGwRunbookContext}: an API Gateway context of the SEND product.
 *
 * @param value - The runbook `runbookContext`
 * @returns Whether the SEND API Gateway pipeline built the runbook
 */
export function isSendApiGwRunbookContext(value: unknown): value is SendApiGwRunbookContext {
  return isApiGwRunbookContext(value) && value.product === RunbookProducts.SEND;
}
