import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { RunbookContext } from '../../../../../engine/types/RunbookContext.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import { readStepOutput } from '../../../../../engine/context/readStepOutput.js';
import { scanApplicationLogs } from '../../../parsing/applicationLogs/scanApplicationLogs.js';
import type { ServiceLogSchema } from '../../../parsing/applicationLogs/ServiceLogSchema.js';
import type { ServiceLogAnalysis } from './ServiceLogAnalysis.js';
import type { ExtractFallbackUuidFn } from '../../../parsing/applicationLogs/ExtractFallbackUuidFn.js';

export interface AnalyzeApplicationLogsConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly varPrefix: string;
  readonly schema: ServiceLogSchema;
  /** Product correlation id extractor, from the query profile. */
  readonly extractFallbackUuid?: ExtractFallbackUuidFn;
}

export class AnalyzeApplicationLogsStep implements Step<ServiceLogAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly varPrefix: string;
  private readonly schema: ServiceLogSchema;
  /** A function: stays out of the definition digest, like the rest of the profile (`queryProfileId`). */
  private readonly extractFallbackUuid: ExtractFallbackUuidFn | undefined;

  constructor(config: AnalyzeApplicationLogsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.varPrefix = config.varPrefix;
    this.schema = config.schema;
    this.extractFallbackUuid = config.extractFallbackUuid;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<ServiceLogAnalysis>> {
    const upstream = readStepOutput<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>(context, this.fromStep);
    if (!upstream.ok) return upstream.failure;

    const results = upstream.value;
    const scan = scanApplicationLogs(results, this.schema, this.extractFallbackUuid);
    const traceId = scan.traceIdCandidate?.canonical;
    const traceIdRaw = scan.traceIdCandidate?.raw;
    const fallbackUuid = scan.fallbackUuid;

    context.services.reporter.add({
      label: 'Analisi log',
      children: [
        { label: `Errori applicativi: ${results.length}` },
        {
          label:
            scan.errorMessage !== ''
              ? `Error message individuato (len=${scan.errorMessage.length})`
              : 'Nessun error message rilevato',
        },
        { label: traceId !== undefined ? `Trace ID: ${traceId}` : 'Nessun trace_id rilevato' },
      ],
    });

    const vars: Record<string, string> = {
      [`${this.varPrefix}ErrorMsg`]: scan.errorMessage,
      [`${this.varPrefix}LogCount`]: String(results.length),
      [`${this.varPrefix}TraceId`]: traceId ?? '',
      [`${this.varPrefix}TraceIdRaw`]: traceIdRaw ?? '',
      [`${this.varPrefix}FallbackUuid`]: fallbackUuid ?? '',
    };

    return {
      success: true,
      output: {
        errorMessage: scan.errorMessage,
        logCount: results.length,
        traceId,
        traceIdRaw,
        fallbackUuid,
      },
      vars,
      next: 'resolve' as const,
    };
  }
}
