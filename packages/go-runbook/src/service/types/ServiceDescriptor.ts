/**
 * Descriptor del servizio applicativo analizzato da un runbook `service`.
 */
export interface ServiceDescriptor {
  /** Nome canonico del servizio, usato anche negli step id. */
  readonly name: string;
  /** CloudWatch Logs group che contiene i log applicativi del servizio. */
  readonly logGroup: string;
  /**
   * Prefix usato per le vars prodotte dalla pipeline.
   *
   * Esempio: `externalChannel` produce `externalChannelErrorMsg`,
   * `externalChannelLogCount`, `externalChannelTraceId`, …
   */
  readonly varPrefix: string;
  /** Override puntuale della query errori, quando il default del profilo non basta. */
  readonly queryOverride?: string;
  /** Override puntuale della query di contesto per trace id. */
  readonly traceQueryOverride?: string;
}
