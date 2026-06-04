import type { ResultField } from '@go-automation/go-common/aws';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import { readStepOutput } from '../../steps/data/readStepOutput.js';

import type { DownstreamErrorPattern } from '../types/DownstreamErrorPattern.js';
import { scanLambdaLogs } from '../helpers/scanLambdaLogs.js';
import type { LambdaErrorScan } from '../helpers/scanLambdaLogs.js';
import { findDownstreamInRows } from '../helpers/matchDownstreamErrorPattern.js';
import { LambdaReporter } from '../reporting/LambdaReporter.js';

/**
 * Configuration for {@link ParseLambdaErrorsStep}.
 */
export interface ParseLambdaErrorsConfig {
  readonly id: string;
  readonly label: string;
  /** Step id of the Lambda error query whose rows to parse. */
  readonly fromStep: string;
  /** Patterns that route a Lambda error to a downstream microservice. */
  readonly downstreamErrorPatterns: ReadonlyArray<DownstreamErrorPattern>;
}

/**
 * Parses the Lambda error-query rows, classifies the error, extracts the
 * requestId and REPORT fields, and routes to a downstream when an error
 * pattern matches. Writes the canonical `lambda*` vars and short-circuits
 * with `next: 'stop'` when no error rows are present.
 */
export class ParseLambdaErrorsStep implements Step<LambdaErrorScan> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly downstreamErrorPatterns: ReadonlyArray<DownstreamErrorPattern>;

  constructor(config: ParseLambdaErrorsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.downstreamErrorPatterns = config.downstreamErrorPatterns;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<LambdaErrorScan>> {
    const upstream = readStepOutput<ReadonlyArray<ReadonlyArray<ResultField>>>(context, this.fromStep);
    if (!upstream.ok) return upstream.failure;

    const scan = scanLambdaLogs(upstream.value);
    if (scan === undefined) {
      return {
        success: true,
        vars: { lambdaErrorCount: '0', terminationReason: 'no-errors' },
        next: 'stop',
      };
    }

    // Match downstream patterns against ALL scan rows, not just the
    // representative message: the routing signal may be on a later row.
    const downstreamTarget = findDownstreamInRows(upstream.value, this.downstreamErrorPatterns)?.target;

    const vars: Record<string, string> = {
      lambdaErrorCount: String(scan.errorCount),
      lambdaErrorCategory: scan.category,
      lambdaErrorMessage: scan.message,
      lastErrorMsg: scan.message,
    };
    if (scan.requestId !== undefined) vars['lambdaRequestId'] = scan.requestId;
    if (scan.report?.status !== undefined) vars['lambdaRuntimeStatus'] = scan.report.status;
    if (scan.report?.durationMs !== undefined) vars['lambdaDurationMs'] = String(scan.report.durationMs);
    if (scan.report?.billedDurationMs !== undefined)
      vars['lambdaBilledDurationMs'] = String(scan.report.billedDurationMs);
    if (scan.report?.memorySizeMb !== undefined) vars['lambdaMemorySizeMb'] = String(scan.report.memorySizeMb);
    if (scan.report?.maxMemoryUsedMb !== undefined) vars['lambdaMaxMemoryUsedMb'] = String(scan.report.maxMemoryUsedMb);
    if (downstreamTarget !== undefined) vars['lambdaDownstreamTarget'] = downstreamTarget;

    if (context.logger !== undefined) {
      new LambdaReporter(context.logger).lambdaResult({
        errorCount: scan.errorCount,
        category: scan.category,
        ...(scan.requestId !== undefined ? { requestId: scan.requestId } : {}),
        ...(scan.report?.status !== undefined ? { runtimeStatus: scan.report.status } : {}),
        ...(scan.report?.durationMs !== undefined ? { durationMs: scan.report.durationMs } : {}),
        ...(scan.report?.memorySizeMb !== undefined ? { memorySizeMb: scan.report.memorySizeMb } : {}),
        ...(scan.report?.maxMemoryUsedMb !== undefined ? { maxMemoryUsedMb: scan.report.maxMemoryUsedMb } : {}),
        ...(downstreamTarget !== undefined ? { downstreamTarget } : {}),
      });
    }

    return { success: true, output: scan, vars };
  }
}
