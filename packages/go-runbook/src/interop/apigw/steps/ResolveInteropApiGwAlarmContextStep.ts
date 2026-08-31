import { getErrorMessage } from '@go-automation/go-common/core';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { InteropApiGwAlarmContext, ResolveInteropApiGwAlarmContextFn } from '../types/InteropApiGwAlarmContext.js';
import { logStepTree } from '../../../core/logStepTree.js';

export interface ResolveInteropApiGwAlarmContextStepConfig {
  readonly id: string;
  readonly label: string;
  readonly resolverId: string;
  readonly resolveAlarmContext: ResolveInteropApiGwAlarmContextFn;
}

export class ResolveInteropApiGwAlarmContextStep implements Step<InteropApiGwAlarmContext> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  private readonly resolverId: string;
  private readonly resolveAlarmContext: ResolveInteropApiGwAlarmContextFn;

  constructor(config: ResolveInteropApiGwAlarmContextStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.resolverId = config.resolverId;
    this.resolveAlarmContext = config.resolveAlarmContext;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      alarmName: context.params.get('alarmName') ?? null,
      resolver: this.resolverId,
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<InteropApiGwAlarmContext>> {
    const alarmName = context.params.get('alarmName');
    if (alarmName === undefined || alarmName.trim() === '') {
      return { success: false, error: 'Missing required parameter: alarmName' };
    }

    let alarmContext: InteropApiGwAlarmContext;
    try {
      alarmContext = this.resolveAlarmContext(alarmName);
    } catch (error: unknown) {
      return {
        success: false,
        error: `INTEROP API Gateway alarm context resolution failed (${this.resolverId}): ${getErrorMessage(error)}`,
      };
    }

    logStepTree(context.logger, [
      { label: `Ambiente INTEROP: ${alarmContext.environment}` },
      { label: `API Gateway ID: ${alarmContext.apiGwId}` },
      { label: `Access log group: ${alarmContext.apiGwLogGroup}` },
      { label: `Pod app: ${alarmContext.podApp}` },
      { label: `Application log group: ${alarmContext.applicationLogGroup}` },
    ]);

    return {
      success: true,
      output: alarmContext,
      vars: {
        interopEnvironment: alarmContext.environment,
        interopApiGwId: alarmContext.apiGwId,
        interopApiGwLogGroup: alarmContext.apiGwLogGroup,
        interopPodApp: alarmContext.podApp,
        interopLogGroup: alarmContext.applicationLogGroup,
        interopRunbookKey: alarmContext.runbookKey,
      },
    };
  }
}
