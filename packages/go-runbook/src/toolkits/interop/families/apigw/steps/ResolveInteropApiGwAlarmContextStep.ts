import { ResolveInteropAlarmContextStep } from '../../../alarms/ResolveInteropAlarmContextStep.js';
import type { ResolveInteropAlarmContextFn } from '../../../alarms/ResolveInteropAlarmContextFn.js';
import type { InteropApiGwAlarmContext } from '../types/InteropApiGwAlarmContext.js';

export interface ResolveInteropApiGwAlarmContextStepConfig {
  readonly id: string;
  readonly label: string;
  readonly resolverId: string;
  readonly resolveAlarmContext: ResolveInteropAlarmContextFn<InteropApiGwAlarmContext>;
}

/**
 * First step of an INTEROP API Gateway alarm runbook: environment, API Gateway, access log group, pod app and
 * application log group of the alarm that fired.
 *
 * @example
 * ```typescript
 * new ResolveInteropApiGwAlarmContextStep({ id: 'resolve-interop-api-gw-context', label: '…', resolverId, resolveAlarmContext });
 * ```
 */
export class ResolveInteropApiGwAlarmContextStep extends ResolveInteropAlarmContextStep<InteropApiGwAlarmContext> {
  private readonly resolverId: string;

  /**
   * @param config - Id, label, resolver id and resolver of the context
   */
  constructor(config: ResolveInteropApiGwAlarmContextStepConfig) {
    super(config.id, config.label, config.resolveAlarmContext);
    this.resolverId = config.resolverId;
  }

  protected override resolver(): string {
    return this.resolverId;
  }

  protected override familyName(): string {
    return 'API Gateway';
  }

  protected override describe(alarmContext: InteropApiGwAlarmContext): ReadonlyArray<string> {
    return [
      `Ambiente INTEROP: ${alarmContext.environment}`,
      `API Gateway ID: ${alarmContext.apiGwId}`,
      `Access log group: ${alarmContext.apiGwLogGroup}`,
      `Pod app: ${alarmContext.podApp}`,
      `Application log group: ${alarmContext.applicationLogGroup}`,
    ];
  }

  protected override contextVars(alarmContext: InteropApiGwAlarmContext): Readonly<Record<string, string>> {
    return {
      interopEnvironment: alarmContext.environment,
      interopApiGwId: alarmContext.apiGwId,
      interopApiGwLogGroup: alarmContext.apiGwLogGroup,
      interopPodApp: alarmContext.podApp,
      interopLogGroup: alarmContext.applicationLogGroup,
      interopRunbookKey: alarmContext.runbookKey,
    };
  }
}
