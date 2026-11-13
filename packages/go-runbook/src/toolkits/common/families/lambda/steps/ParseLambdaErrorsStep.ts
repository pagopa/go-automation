import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { omitUndefined } from '@pagopa/go-common/utils';
import type { Step } from '../../../../../engine/types/Step.js';
import type { StepKind } from '../../../../../engine/types/StepKind.js';
import type { RunbookContext } from '../../../../../engine/types/RunbookContext.js';
import type { StepResult } from '../../../../../engine/types/StepResult.js';
import { readStepOutput } from '../../../../../engine/context/readStepOutput.js';

import type { DownstreamErrorPattern } from '../types/DownstreamErrorPattern.js';
import { scanLambdaLogs } from '../helpers/scanLambdaLogs.js';
import type { LambdaErrorScan } from '../helpers/scanLambdaLogs.js';
import type { LambdaErrorScannerFn } from '../types/LambdaErrorScannerFn.js';
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
  /** Product signatures of a failed downstream call, from the query profile. */
  readonly downstreamSignatures: ReadonlyArray<RegExp>;
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
  /**
   * Scanner bound to the profile's downstream signatures. A function, so the
   * signatures stay out of the definition digest: the profile is already
   * identified by `queryProfileId` in the runbook context.
   */
  private readonly scan: LambdaErrorScannerFn;

  constructor(config: ParseLambdaErrorsConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.downstreamErrorPatterns = config.downstreamErrorPatterns;
    this.scan = (rows) => scanLambdaLogs(rows, config.downstreamSignatures);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<LambdaErrorScan>> {
    const upstream = readStepOutput<ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>>(context, this.fromStep);
    if (!upstream.ok) return upstream.failure;

    const scan = this.scan(upstream.value);
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

    new LambdaReporter(context.services.reporter).lambdaResult({
      errorCount: scan.errorCount,
      category: scan.category,
      ...omitUndefined({
        requestId: scan.requestId,
        runtimeStatus: scan.report?.status,
        durationMs: scan.report?.durationMs,
        memorySizeMb: scan.report?.memorySizeMb,
        maxMemoryUsedMb: scan.report?.maxMemoryUsedMb,
        downstreamTarget,
      }),
    });

    return { success: true, output: scan, vars };
  }
}
