import { trimToUndefined } from '@pagopa/go-common/utils';
import { readRowFields } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { RunbookContext, Step, StepKind, StepResult } from '../../../../engine/index.js';
import { readCidTrackerResults } from '../helpers/readCidTrackerResults.js';
import type { AnalyzeInteropCidTrackerStepConfig } from './AnalyzeInteropCidTrackerStepConfig.js';
import type { InteropK8sCidTrackerAnalysis } from './InteropK8sCidTrackerAnalysis.js';

const MAX_MESSAGES = 20;
const DEFAULT_VAR_PREFIX = 'interopCidTracker';

/**
 * Summarizes the rows the CID tracker read: the pods they come from and some messages, published as variables with a
 * prefix.
 */
export class AnalyzeInteropCidTrackerStep implements Step<InteropK8sCidTrackerAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly varPrefix: string;

  constructor(config: AnalyzeInteropCidTrackerStepConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.varPrefix = config.varPrefix ?? DEFAULT_VAR_PREFIX;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<InteropK8sCidTrackerAnalysis>> {
    const cidResults = readCidTrackerResults(context.stepResults.get(this.fromStep));
    if (cidResults === undefined) return { success: false, error: `Step output not found: "${this.fromStep}"` };

    const podApps = new Set<string>();
    const messages: string[] = [];
    let logCount = 0;

    for (const cidResult of cidResults) {
      for (const row of cidResult.rows) {
        logCount += 1;
        const podApp = trimToUndefined(readRowFields(row, ['pod_app'])[0]);
        if (podApp !== undefined) podApps.add(podApp);

        const message = trimToUndefined(readRowFields(row, ['@message', 'message', 'log'])[0]);
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
    };
  }
}

function varName(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`;
}
