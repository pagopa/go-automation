import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';

import type { InteropSelfcareApiGwAlarmContext } from './resolveInteropAlarmContext.js';
import { resolveInteropSelfcareApiGwAlarmContext } from './resolveInteropAlarmContext.js';

export class ResolveInteropSelfcareApiGwContextStep implements Step<InteropSelfcareApiGwAlarmContext> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'control';

  constructor(config: { readonly id: string; readonly label: string }) {
    this.id = config.id;
    this.label = config.label;
  }

  getTraceInfo(context: RunbookContext): Readonly<Record<string, unknown>> {
    return {
      alarmName: context.params.get('alarmName') ?? null,
      resolver: 'interop-selfcare-api-gateway-context',
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<InteropSelfcareApiGwAlarmContext>> {
    const alarmName = context.params.get('alarmName');
    if (alarmName === undefined || alarmName.trim() === '') {
      return { success: false, error: 'Missing required parameter: alarmName' };
    }

    const alarmContext = resolveInteropSelfcareApiGwAlarmContext(alarmName);
    context.logger?.text(`      ├─ Ambiente INTEROP: ${alarmContext.environment}`);
    context.logger?.text(`      ├─ API Gateway ID: ${alarmContext.apiGwId}`);
    context.logger?.text(`      ├─ Access log group: ${alarmContext.apiGwLogGroup}`);
    context.logger?.text(`      ├─ Pod app: ${alarmContext.podApp}`);
    context.logger?.text(`      └─ Application log group: ${alarmContext.applicationLogGroup}`);

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
