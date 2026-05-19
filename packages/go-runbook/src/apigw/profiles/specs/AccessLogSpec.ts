import type { AccessLogSchema } from '../schemas/AccessLogSchema.js';

/**
 * Specification della capability AccessLog. Obbligatoria per ogni profilo
 * API Gateway: senza accessLog non esiste un runbook API GW.
 */
export interface AccessLogSpec {
  /**
   * Query CloudWatch Logs Insights eseguita sul log group del API Gateway.
   * Deve contenere il placeholder `{{minStatusCode}}`, sostituito a
   * build-time da `createApiGwAlarmRunbook`.
   */
  readonly query: string;

  /** Schema dei campi che la query produce. */
  readonly schema: AccessLogSchema;
}
