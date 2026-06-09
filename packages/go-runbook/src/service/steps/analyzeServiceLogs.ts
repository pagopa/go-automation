import type { ResultField } from '@go-automation/go-common/aws';

import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import { readStepOutput } from '../../steps/data/readStepOutput.js';
import { scanApplicationLogs } from '../helpers/scanApplicationLogs.js';
import type { ServiceLogSchema } from '../types/ServiceLogSchema.js';
import type { ServiceLogAnalysis } from './ServiceLogAnalysis.js';

export interface AnalyzeServiceLogsConfig {
  readonly id: string;
  readonly label: string;
  readonly fromStep: string;
  readonly serviceName: string;
  readonly varPrefix: string;
  readonly schema: ServiceLogSchema;
}

class AnalyzeServiceLogsStep implements Step<ServiceLogAnalysis> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly serviceName: string;
  private readonly varPrefix: string;
  private readonly schema: ServiceLogSchema;

  constructor(config: AnalyzeServiceLogsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.serviceName = config.serviceName;
    this.varPrefix = config.varPrefix;
    this.schema = config.schema;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<ServiceLogAnalysis>> {
    const upstream = readStepOutput<ReadonlyArray<ReadonlyArray<ResultField>>>(context, this.fromStep);
    if (!upstream.ok) return upstream.failure;

    const results = upstream.value;
    const scan = scanApplicationLogs(results, this.schema);
    const traceId = scan.traceIdCandidate?.canonical;
    const traceIdRaw = scan.traceIdCandidate?.raw;
    const fallbackUuid = scan.fallbackUuid;

    context.logger?.text(`      ├─ Analisi log`);
    context.logger?.text(`      │    ├─ Errori applicativi: ${results.length}`);
    if (scan.errorMessage !== '') {
      context.logger?.text(`      │    ├─ Error message individuato (len=${scan.errorMessage.length})`);
    } else {
      context.logger?.text(`      │    ├─ Nessun error message rilevato`);
    }
    if (traceId !== undefined) {
      context.logger?.text(`      │    └─ Trace ID: ${traceId}`);
    } else {
      context.logger?.text(`      │    └─ Nessun trace_id rilevato`);
    }

    const vars: Record<string, string> = {
      [`${this.varPrefix}ErrorMsg`]: scan.errorMessage,
      [`${this.varPrefix}LogCount`]: String(results.length),
      [`${this.varPrefix}TraceId`]: traceId ?? '',
      [`${this.varPrefix}TraceIdRaw`]: traceIdRaw ?? '',
      [`${this.varPrefix}FallbackUuid`]: fallbackUuid ?? '',
      serviceName: this.serviceName,
      serviceErrorCount: String(results.length),
      lastErrorMsg: scan.errorMessage,
      traceId: traceId ?? '',
    };

    if (fallbackUuid !== undefined) {
      vars['fallbackUuid'] = fallbackUuid;
    }

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

export function analyzeServiceLogs(config: AnalyzeServiceLogsConfig): Step<ServiceLogAnalysis> {
  return new AnalyzeServiceLogsStep(config);
}
