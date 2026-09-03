import type { BuildInteropK8sApplicationLogsQueryFn } from '../../k8s/profiles/InteropK8sQueryProfile.js';
import type { BuildInteropApiGwAggregateQueryFn } from '../steps/QueryInteropApiGwAggregatesStep.js';

/**
 * The two queries an INTEROP API Gateway runbook runs, plus the ids that
 * identify them in the execution trace.
 *
 * The access-log side is the same aggregate for every runbook of the family,
 * parameterised by the error family; the application side differs per service,
 * which is why a profile pairs them.
 *
 * A profile carries no id of its own: the id a runbook advertises in its
 * `runbookContext` describes that runbook, so two runbooks sharing this
 * profile still each declare their own.
 */
export interface InteropApiGwQueryProfile {
  /** Error family analysed, e.g. `4xx` or `5xx`. Rendered in step labels. */
  readonly errorFamilyLabel: string;
  /** Profile id recorded in the aggregate query's trace metadata. */
  readonly apiGwQueryProfileId: string;
  /** Query kind recorded in the aggregate query's trace metadata. */
  readonly apiGwQueryKind: string;
  readonly buildApiGwAggregateQuery: BuildInteropApiGwAggregateQueryFn;
  /** Profile id recorded in the application-log query's trace metadata. */
  readonly applicationLogsQueryProfileId: string;
  readonly buildApplicationLogsQuery: BuildInteropK8sApplicationLogsQueryFn;
}
