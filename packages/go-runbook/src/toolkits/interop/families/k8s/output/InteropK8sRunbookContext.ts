import {
  isServiceRunbookContext,
  type ServiceRunbookContext,
} from '../../../../common/families/service/output/ServiceRunbookContext.js';
import { RunbookProducts } from '../../../../common/registration/RunbookProduct.js';

/**
 * Context of an INTEROP K8S runbook. Its `kind` stays `service`, so the generic service
 * output builder serves it unchanged; the product tells it apart from the SEND service
 * runbooks (EVO-RBREORG-OPUS-01 P19).
 */
export interface InteropK8sRunbookContext extends ServiceRunbookContext {
  readonly product: typeof RunbookProducts.INTEROP;
}

/**
 * Type guard for {@link InteropK8sRunbookContext}: a service context of the INTEROP product.
 *
 * @param value - The runbook `runbookContext`
 * @returns Whether the runbook is an INTEROP K8S runbook
 */
export function isInteropK8sRunbookContext(value: unknown): value is InteropK8sRunbookContext {
  return isServiceRunbookContext(value) && value.product === RunbookProducts.INTEROP;
}
