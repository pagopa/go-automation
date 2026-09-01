import type { ResultField } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepKind } from '../../../types/StepKind.js';
import type { StepResult } from '../../../types/StepResult.js';
import type { InteropK8sCidTrackerResult } from './QueryInteropK8sCidTrackerStep.js';

export interface InteropK8sCidTrackerAnalysis {
  readonly cidCount: number;
  readonly logCount: number;
  readonly podApps: ReadonlyArray<string>;
  readonly messages: ReadonlyArray<string>;
}

export interface AnalyzeInteropK8sCidTrackerStepConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly varPrefix?: string;
}

const MAX_MESSAGES = 20;
const DEFAULT_VAR_PREFIX = 'interopCidTracker';

export class AnalyzeInteropK8sCidTrackerStep implements Step<InteropK8sCidTrackerAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly varPrefix: string;

  constructor(config: AnalyzeInteropK8sCidTrackerStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.varPrefix = config.varPrefix ?? DEFAULT_VAR_PREFIX;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<InteropK8sCidTrackerAnalysis>> {
    const cidResults = readCidTrackerResults(context, this.fromStep);
    if (cidResults === undefined) return { success: false, error: `Step output not found: "${this.fromStep}"` };

    const podApps = new Set<string>();
    const messages: string[] = [];
    let logCount = 0;

    for (const cidResult of cidResults) {
      for (const row of cidResult.rows) {
        logCount += 1;
        const podApp = normalize(readField(row, ['pod_app']));
        if (podApp !== undefined) podApps.add(podApp);

        const message = normalize(readField(row, ['@message', 'message', 'log']));
        if (message !== undefined && messages.length < MAX_MESSAGES) messages.push(message);
      }
    }

    const analysis: InteropK8sCidTrackerAnalysis = {
      cidCount: cidResults.length,
      logCount,
      podApps: [...podApps].sort(),
      messages,
    };

    context.services.reporter.add(
      { label: `CID tracker analizzati: ${analysis.cidCount}` },
      { label: `Log correlati: ${analysis.logCount}` },
      { label: `Pod app correlati: ${analysis.podApps.join(', ') || '-'}` },
    );

    return {
      success: true,
      output: analysis,
      vars: {
        [varName(this.varPrefix, 'PodApps')]: JSON.stringify(analysis.podApps),
        [varName(this.varPrefix, 'Messages')]: JSON.stringify(analysis.messages),
        [varName(this.varPrefix, 'AnalysisCompleted')]: 'true',
      },
      next: 'resolve',
    };
  }
}

function readCidTrackerResults(
  context: RunbookContext,
  stepId: string,
): ReadonlyArray<InteropK8sCidTrackerResult> | undefined {
  const value = context.stepResults.get(stepId);
  if (!Array.isArray(value)) return undefined;
  return value.filter(isCidTrackerResult);
}

function isCidTrackerResult(value: unknown): value is InteropK8sCidTrackerResult {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Readonly<Record<string, unknown>>;
  return typeof record['cid'] === 'string' && Array.isArray(record['rows']);
}

function readField(row: ReadonlyArray<ResultField>, names: ReadonlyArray<string>): string | undefined {
  for (const field of row) {
    const fieldName = field.field;
    if (fieldName === undefined || !names.includes(fieldName)) continue;
    if (field.value !== undefined) return field.value;
  }
  return undefined;
}

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function varName(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`;
}
