/**
 * Normalizes values returned by the aggregated INTEROP API Gateway query.
 * API Gateway access logs use `-` when an optional field is not available.
 */
export function normalizeInteropApiGwAggregateValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized === '' || normalized === '-' ? undefined : normalized;
}
