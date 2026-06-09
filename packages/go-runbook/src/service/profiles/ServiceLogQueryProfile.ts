import type { ServiceLogSchema } from '../types/ServiceLogSchema.js';

/**
 * Profilo query/schema per runbook `service`.
 */
export interface ServiceLogQueryProfile {
  /** Identificatore diagnostico del profilo. */
  readonly id: string;
  /** Query CloudWatch Logs Insights per la prima scansione errori. */
  readonly errorQuery: string;
  /**
   * Query CloudWatch Logs Insights per ricostruire il contesto di un
   * `trace_id` estratto dalla prima scansione.
   *
   * Deve contenere il placeholder `{{TRACE_ID}}`.
   */
  readonly traceQueryTemplate: string;
  /** Schema dei campi applicativi nel risultato CloudWatch Logs. */
  readonly schema: ServiceLogSchema;
}
