import type { ServiceLogSchema } from '../../../../common/parsing/applicationLogs/ServiceLogSchema.js';
import type { KnownUrlsRegistry } from '../../../../common/parsing/knownUrls/KnownUrlsRegistry.js';

/** How a service level of a SEND API Gateway runbook divides the rows of its read into errors. */
export interface ServiceErrorLevelConfig {
  /** The grouped read of the level: its rows are the scoped rows of the nodes. */
  readonly readStepId: string;
  /** Prefix of the variables of the service (`delivery` → `deliveryErrorMsg`). */
  readonly varPrefix: string;
  readonly schema: ServiceLogSchema;
  /** Known URLs: the downstream a row calls, and the fallback UUID of that call. */
  readonly registry: KnownUrlsRegistry;
  /** Variable with the trace id the chain follows. */
  readonly traceIdContextVar: string;
  readonly mergeIdenticalErrors?: boolean;
}
