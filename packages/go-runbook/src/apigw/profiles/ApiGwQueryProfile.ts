import type { AccessLogSpec } from './specs/AccessLogSpec.js';
import type { ServiceLogSpec } from './specs/ServiceLogSpec.js';
import type { ExecutionLogSpec } from './specs/ExecutionLogSpec.js';

/**
 * Profilo di query per i runbook di tipo API Gateway.
 *
 * Un profilo bundla **query + schema dei campi** per uno specifico
 * prodotto (es. SEND, INTEROP). Le capability opzionali (`executionLog`)
 * determinano _quali step vengono cablati_ in pipeline, non solo quali
 * query vengono eseguite.
 *
 * @see SEND_API_GW_PROFILE per l'istanza di riferimento.
 */
export interface ApiGwQueryProfile {
  /** Identificatore canonico del prodotto (`'send'`, `'interop'`, ...). */
  readonly id: string;

  /** Capability AccessLog. Obbligatoria. */
  readonly accessLog: AccessLogSpec;

  /** Capability ServiceLog. Obbligatoria. */
  readonly serviceLog: ServiceLogSpec;

  /**
   * Capability ExecutionLog. Opzionale (presente per SEND, assente per
   * INTEROP). Quando assente, gli step
   * `query-api-gw-execution-logs` e `stop-api-gw-execution-log-unresolved`
   * non vengono cablati nella pipeline.
   */
  readonly executionLog?: ExecutionLogSpec;
}
