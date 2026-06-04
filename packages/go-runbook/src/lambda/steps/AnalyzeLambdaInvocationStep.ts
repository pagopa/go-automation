import type { ResultField } from '@go-automation/go-common/aws';
import type { Step } from '../../types/Step.js';
import type { StepKind } from '../../types/StepKind.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { StepResult } from '../../types/StepResult.js';
import { readStepOutput } from '../../steps/data/readStepOutput.js';

import type { DownstreamErrorPattern } from '../types/DownstreamErrorPattern.js';
import { findDownstreamInRows } from '../helpers/matchDownstreamErrorPattern.js';
import { scanLambdaLogs } from '../helpers/scanLambdaLogs.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;

/**
 * Configuration for {@link AnalyzeLambdaInvocationStep}.
 */
export interface AnalyzeLambdaInvocationConfig {
  readonly id: string;
  readonly label: string;
  /** Step id of the invocation-flow query whose rows to analyse. */
  readonly fromStep: string;
  /** Patterns that route a Lambda error to a downstream microservice. */
  readonly downstreamErrorPatterns: ReadonlyArray<DownstreamErrorPattern>;
}

/**
 * Writes `vars[name] = value` only when the value exists and the context var
 * is not already set, so values produced by the error scan are never
 * overwritten by the (later) invocation-flow enrichment.
 */
function setVarIfMissing(
  vars: Record<string, string>,
  current: ReadonlyMap<string, string>,
  name: string,
  value: string | undefined,
): void {
  if (value !== undefined && value !== '' && (current.get(name) ?? '') === '') {
    vars[name] = value;
  }
}

/**
 * Renders a numeric REPORT field as a string var, or `undefined` when absent.
 */
function numberToVar(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

/**
 * Analyses the reconstructed invocation flow (`query-lambda-invocation`) and
 * does two things, both only filling gaps left by the error scan:
 *
 * 1. Enriches the runtime `REPORT` vars (`lambdaRuntimeStatus`,
 *    `lambdaDurationMs`, `lambdaBilledDurationMs`, `lambdaMemorySizeMb`,
 *    `lambdaMaxMemoryUsedMb`). The error scan often matches a non-`REPORT`
 *    line (e.g. "Task timed out"), leaving those fields unset; the `REPORT`
 *    line itself lives in the requestId-scoped flow.
 * 2. Recovers the `lambdaDownstreamTarget` (and refines
 *    `lastErrorMsg`/`lambdaErrorCategory`) when the routing signal appears
 *    only in the reconstructed flow and no downstream was already routed.
 */
export class AnalyzeLambdaInvocationStep implements Step<undefined> {
  readonly id: string;
  readonly label: string;
  readonly kind: StepKind = 'transform';

  private readonly fromStep: string;
  private readonly downstreamErrorPatterns: ReadonlyArray<DownstreamErrorPattern>;

  constructor(config: AnalyzeLambdaInvocationConfig) {
    this.id = config.id;
    this.label = config.label;
    this.fromStep = config.fromStep;
    this.downstreamErrorPatterns = config.downstreamErrorPatterns;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(context: RunbookContext): Promise<StepResult<undefined>> {
    // The invocation query is a no-op without a requestId, so it may have no
    // output: treat that as "nothing to analyse" rather than an error.
    const upstream = readStepOutput<Rows>(context, this.fromStep);
    if (!upstream.ok || upstream.value.length === 0) {
      return { success: true };
    }
    const rows = upstream.value;

    const vars: Record<string, string> = {};

    // 1. Enrich runtime REPORT fields from the fuller flow (the REPORT line is
    // here even when the error scan matched a "Task timed out" line instead).
    const report = scanLambdaLogs(rows)?.report;
    if (report !== undefined) {
      setVarIfMissing(vars, context.vars, 'lambdaRuntimeStatus', report.status);
      setVarIfMissing(vars, context.vars, 'lambdaDurationMs', numberToVar(report.durationMs));
      setVarIfMissing(vars, context.vars, 'lambdaBilledDurationMs', numberToVar(report.billedDurationMs));
      setVarIfMissing(vars, context.vars, 'lambdaMemorySizeMb', numberToVar(report.memorySizeMb));
      setVarIfMissing(vars, context.vars, 'lambdaMaxMemoryUsedMb', numberToVar(report.maxMemoryUsedMb));
    }

    // 2. Recover downstream routing when not already routed and patterns exist.
    if ((context.vars.get('lambdaDownstreamTarget') ?? '').trim() === '' && this.downstreamErrorPatterns.length > 0) {
      const match = findDownstreamInRows(rows, this.downstreamErrorPatterns);
      if (match !== undefined) {
        vars['lambdaDownstreamTarget'] = match.target;
        vars['lastErrorMsg'] = match.message;
        // The downstream is the actionable signal: promote the category unless
        // a more critical runtime category (timeout/OOM/throttle) was detected.
        const category = (context.vars.get('lambdaErrorCategory') ?? '').trim();
        if (category === '' || category === 'unknown' || category === 'application-error') {
          vars['lambdaErrorCategory'] = 'downstream';
        }
      }
    }

    return Object.keys(vars).length > 0 ? { success: true, vars } : { success: true };
  }
}
