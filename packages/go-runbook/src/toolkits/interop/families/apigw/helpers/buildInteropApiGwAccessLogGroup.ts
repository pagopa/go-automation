export const INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE = 'amazon-apigateway-interop-access-logs-<environment>';

/** Resolves the environment-specific INTEROP API Gateway access log group. */
export function buildInteropApiGwAccessLogGroup(environment: string): string {
  const normalized = environment.trim();
  if (normalized === '') throw new Error('INTEROP environment must not be blank');
  return INTEROP_API_GW_ACCESS_LOG_GROUP_TEMPLATE.replace('<environment>', normalized);
}
