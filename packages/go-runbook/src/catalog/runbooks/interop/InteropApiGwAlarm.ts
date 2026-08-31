import type { InteropApiGwRunbookStepIds } from '../../../interop/apigw/types/InteropApiGwRunbookStepIds.js';
import type { InteropApiGwAlarmContext } from '../../../interop/apigw/types/InteropApiGwAlarmContext.js';

/** Resolves the runtime context of one INTEROP API Gateway alarm. */
type ResolveContextFn<TContext extends InteropApiGwAlarmContext> = (alarmName: string) => TContext;

/**
 * Everything a runbook, its known cases and the registry need about one
 * INTEROP API Gateway alarm.
 *
 * The API Gateway counterpart of `InteropK8sAlarm`. It is assembled by hand
 * rather than by a factory because neither the alarm names nor the API
 * Gateway ids follow from the runbook key: one family carries the environment
 * in the middle of the name, the other has a variant that exists in two
 * environments out of three.
 */
export interface InteropApiGwAlarm<TContext extends InteropApiGwAlarmContext = InteropApiGwAlarmContext> {
  readonly runbookKey: string;
  /** Pod app under analysis; also the primary analysis resource. */
  readonly serviceName: string;
  /** Value the application query filters on, when it is not {@link serviceName}. */
  readonly podAppFilter?: string;
  /** Prefix of the context vars the analysis writes. */
  readonly varPrefix: string;
  /** Profile advertised in `runbookContext`; describes this runbook. */
  readonly apiGwProfileId: string;
  readonly apiGwLogGroupTemplate: string;
  readonly applicationLogGroupTemplate: string;
  /** Every alarm this runbook answers to. */
  readonly alarmNames: readonly [string, ...string[]];
  /** Ids of the seven pipeline steps, referenced by known cases and tests. */
  readonly stepIds: InteropApiGwRunbookStepIds;
  /**
   * Resolves the runtime context from the alarm name that fired.
   *
   * The type parameter keeps the runbook's own narrowing — the supported
   * environments, for instance — instead of widening it away at the boundary.
   */
  readonly resolveContext: ResolveContextFn<TContext>;
}
