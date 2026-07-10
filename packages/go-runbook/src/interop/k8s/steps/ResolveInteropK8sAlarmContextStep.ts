import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { InteropK8sAlarmContext, ResolveInteropK8sAlarmContextFn } from '../types/InteropK8sAlarmContext.js';

export interface ResolveInteropK8sAlarmContextStepConfig {
  readonly id: string;
  readonly label: string;
  readonly resolveAlarmContext: ResolveInteropK8sAlarmContextFn;
}

export class ResolveInteropK8sAlarmContextStep implements Step<InteropK8sAlarmContext> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  private readonly resolveAlarmContext: ResolveInteropK8sAlarmContextFn;

  constructor(config: ResolveInteropK8sAlarmContextStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.resolveAlarmContext = config.resolveAlarmContext;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      alarmName: context.params.get('alarmName') ?? null,
      resolver: 'interop-k8s-alarm-context',
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<InteropK8sAlarmContext>> {
    const alarmName = context.params.get('alarmName');
    if (alarmName === undefined || alarmName.trim() === '') {
      return { success: false, error: 'Missing required parameter: alarmName' };
    }

    const alarmContext = this.resolveAlarmContext(alarmName);
    context.logger?.text(`      ├─ Ambiente INTEROP: ${alarmContext.environment}`);
    context.logger?.text(`      ├─ Pod app: ${alarmContext.podApp}`);
    context.logger?.text(`      └─ Log group: ${alarmContext.logGroup}`);

    return {
      success: true,
      output: alarmContext,
      vars: {
        interopEnvironment: alarmContext.environment,
        interopPodApp: alarmContext.podApp,
        interopLogGroup: alarmContext.logGroup,
        interopRunbookKey: alarmContext.runbookKey,
      },
    };
  }
}
