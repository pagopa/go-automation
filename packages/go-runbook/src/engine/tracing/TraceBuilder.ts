import { omitUndefined } from '@pagopa/go-common/utils';
import type { StepTrace } from './StepTrace.js';
import type { StepTraceEntry } from './StepTraceEntry.js';
import type { CaseEvaluationTrace } from './CaseEvaluationTrace.js';
import type { ActionTrace } from './ActionTrace.js';
import type { ActionType } from './ActionType.js';
import type { ExecutionSummary } from './ExecutionSummary.js';
import type { ExecutionEnvironment } from './ExecutionEnvironment.js';
import type { RunbookExecutionTrace } from './RunbookExecutionTrace.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { Runbook } from '../types/Runbook.js';
import type { KnownError } from '../types/KnownError.js';
import type { CaseAction } from '../types/CaseAction.js';
import type { RunbookExecutionStatus } from '../types/RunbookExecutionStatus.js';
import type { CoverageEntry } from '../types/CoverageEntry.js';
import type { TraceStatus } from './TraceStatus.js';

/**
 * Builder for the {@link RunbookExecutionTrace}.
 *
 * The builder is **mutable and single-owner**: the engine drives it
 * sequentially and is the only thing holding it. Every `trace*` method records
 * into the builder and returns nothing, so a caller cannot mistake it for a
 * persistent structure.
 *
 * @example
 * ```typescript
 * const builder = new TraceBuilder('exec-123', runbook, params);
 * builder.traceStep({
 *   stepId: 'query-logs',
 *   label: 'Search errors',
 *   kind: 'data',
 *   reachedVia: 'sequential',
 *   startedAt: t0,
 *   completedAt: t1,
 *   durationMs: 1833,
 *   status: 'success',
 *   recovered: false,
 *   input,
 *   output,
 *   varsWritten: {},
 *   flowDirective: 'continue',
 * });
 * builder.traceCaseEvaluation(knownError, true, { 'vars.statusCode': '504' });
 * builder.traceAction(action, 'notify', 'success', 120);
 *
 * const trace = builder.build(finalContext, 'completed', environment);
 * ```
 */
export class TraceBuilder {
  private static readonly defaultActionTrace: ActionTrace = {
    executed: false,
    actionType: 'fallback',
    actionDetail: { type: 'log', level: 'warn', title: 'Nessuna azione eseguita' },
    status: 'success',
    durationMs: 0,
  };

  private readonly stepTraces: StepTrace[] = [];
  private readonly caseEvaluations: CaseEvaluationTrace[] = [];
  private readonly actionTraces: ActionTrace[] = [];
  private detectionIds: ReadonlyArray<string> = [];
  private coverage: ReadonlyArray<CoverageEntry> = [];
  private readonly startedAt: string;
  private readonly startedAtMs: number;

  constructor(
    private readonly executionId: string,
    private readonly runbook: Runbook,
    private readonly params: ReadonlyMap<string, string>,
  ) {
    const now = new Date();
    this.startedAt = now.toISOString();
    this.startedAtMs = now.getTime();
  }

  /**
   * Records the trace of an executed step; its execution order is the position in the trace.
   *
   * @param entry - The step trace, without its execution order
   */
  traceStep(entry: StepTraceEntry): void {
    this.stepTraces.push({ executionOrder: this.stepTraces.length + 1, ...entry });
  }

  /**
   * Records the evaluation of a known error.
   *
   */
  traceCaseEvaluation(
    knownError: KnownError,
    matched: boolean,
    resolvedValues: Readonly<Record<string, unknown>>,
    match: Pick<CaseEvaluationTrace, 'firstSeenAt' | 'lastSeenAt' | 'evidenceRows' | 'supersededBy' | 'nodeId'> = {},
  ): void {
    this.caseEvaluations.push({
      knownErrorCode: knownError.code,
      description: knownError.description,
      condition: knownError.condition,
      matched,
      resolvedValues,
      ...match,
    });
  }

  /**
   * Records the order of the detections, which the trace reports as `matchedKnownErrorCodes`.
   *
   * @param knownErrorCodes - Ids of the detections, in their order
   */
  traceDetections(knownErrorCodes: ReadonlyArray<string>): void {
    this.detectionIds = knownErrorCodes;
  }

  /**
   * Records the partial evidence of the execution.
   *
   * @param coverage - Coverage entries, in the order they were declared
   */
  traceCoverage(coverage: ReadonlyArray<CoverageEntry>): void {
    this.coverage = coverage;
  }

  /**
   * Records the result of an executed action.
   *
   */
  traceAction(
    action: CaseAction,
    actionType: ActionType,
    status: TraceStatus,
    durationMs: number,
    resolvedMessage?: string,
    error?: string,
  ): void {
    this.actionTraces.push({
      executed: true,
      actionType,
      actionDetail: action,
      status,
      durationMs,
      ...omitUndefined({ resolvedMessage, error }),
    });
  }

  /**
   * Assembles the final execution trace.
   */
  build(
    finalContext: RunbookContext,
    status: RunbookExecutionStatus,
    environment: ExecutionEnvironment,
    failureReason?: string,
  ): RunbookExecutionTrace {
    const completedAtDate = new Date();
    const completedAt = completedAtDate.toISOString();
    const durationMs = completedAtDate.getTime() - this.startedAtMs;

    const matchedKnownErrorCodes = this.detectionIds;

    const variables: Record<string, string> = Object.fromEntries(finalContext.vars);
    const input: Record<string, string> = Object.fromEntries(this.params);

    // Single-pass computation of summary metrics
    const totalSteps = this.runbook.steps.length;
    const stepsExecuted = this.stepTraces.length;
    let stepsFailed = 0;
    let stepsRecovered = 0;

    for (const step of this.stepTraces) {
      if (step.status === 'failed' && !step.recovered) {
        stepsFailed += 1;
      }
      if (step.recovered) {
        stepsRecovered += 1;
      }
    }

    // The steps of the window not executed: a step run for several nodes or batches counts once.
    const windowIds = new Set(this.runbook.steps.map((descriptor) => descriptor.step.id));
    const executedWindow = new Set(
      this.stepTraces.filter((step) => windowIds.has(step.stepId)).map((step) => step.stepId),
    );
    const stepsSkipped = totalSteps - executedWindow.size;
    const outcomeCase = matchedKnownErrorCodes.length === 0 ? 'no-match' : matchedKnownErrorCodes.join(',');
    const primaryActionTrace = this.actionTraces[0];
    const outcomeAction = primaryActionTrace?.actionType ?? 'none';

    const summary: ExecutionSummary = {
      description: this.buildSummaryDescription(status, matchedKnownErrorCodes),
      totalSteps,
      stepsExecuted,
      stepsFailed,
      stepsRecovered,
      stepsSkipped,
      outcome: `${outcomeCase} -> ${outcomeAction}`,
    };

    return {
      schemaVersion: '4.0.0',
      execution: {
        executionId: this.executionId,
        runbookId: this.runbook.metadata.id,
        runbookName: this.runbook.metadata.name,
        runbookVersion: this.runbook.metadata.version,
        runbookType: this.runbook.metadata.type,
        startedAt: this.startedAt,
        completedAt,
        durationMs,
        status,
        environment,
        ...(failureReason !== undefined ? { failureReason } : {}),
      },
      input,
      pipeline: this.stepTraces,
      variables,
      caseMatching: {
        casesEvaluated: this.caseEvaluations.length,
        evaluations: this.caseEvaluations,
        matchedKnownErrorCodes,
      },
      actionsExecuted: this.actionTraces.length > 0 ? this.actionTraces : [TraceBuilder.defaultActionTrace],
      coverage: this.coverage,
      // The reads that failed, by kind of source: a failed read has no statistics to count it by.
      ...((finalContext.readFailures?.size ?? 0) > 0
        ? { readFailures: Object.fromEntries(finalContext.readFailures ?? []) }
        : {}),
      summary,
    };
  }

  /**
   * Builds a human-readable description for the execution summary.
   */
  private buildSummaryDescription(
    status: RunbookExecutionStatus,
    matchedKnownErrorCodes: ReadonlyArray<string>,
  ): string {
    const runbookName = this.runbook.metadata.name;

    if (status === 'failed') {
      return `Runbook "${runbookName}" failed during execution`;
    }

    if (status === 'aborted') {
      return `Runbook "${runbookName}" was aborted`;
    }

    if (matchedKnownErrorCodes.length > 0) {
      const descriptions = new Map(
        this.caseEvaluations.map((evaluation) => [evaluation.knownErrorCode, evaluation.description]),
      );
      const cases = matchedKnownErrorCodes
        .map((knownErrorCode) => `"${descriptions.get(knownErrorCode) ?? knownErrorCode}"`)
        .join(', ');
      const noun = matchedKnownErrorCodes.length === 1 ? 'case' : `${String(matchedKnownErrorCodes.length)} cases`;
      return `Runbook "${runbookName}" completed: identified ${noun} ${cases}`;
    }

    return `Runbook "${runbookName}" completed: no known error matched`;
  }
}
