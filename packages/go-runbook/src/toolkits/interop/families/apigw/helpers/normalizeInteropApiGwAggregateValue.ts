import { trimToUndefined } from '@pagopa/go-common/utils';

/**
 * Normalizes values returned by the aggregated INTEROP API Gateway query.
 * API Gateway access logs use `-` when an optional field is not available.
 */
export function normalizeInteropApiGwAggregateValue(value: string | undefined): string | undefined {
  const normalized = trimToUndefined(value);
  return normalized === '-' ? undefined : normalized;
}
