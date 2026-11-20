import { omitUndefined } from '@pagopa/go-common/utils';
import type { StepKind } from '../types/StepKind.js';
import type { StepTrace } from './StepTrace.js';
import type { CaseEvaluationTrace } from './CaseEvaluationTrace.js';
import type { ActionTrace, ActionType } from './ActionTrace.js';
import type { ExecutionSummary } from './ExecutionSummary.js';
import type { ExecutionEnvironment } from './ExecutionEnvironment.js';
import type { RunbookExecutionTrace } from './RunbookExecutionTrace.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { Runbook } from '../types/Runbook.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { CaseAction } from '../types/CaseAction.js';
import type { FlowDirectiveString } from '../types/FlowDirective.js';
import type { RunbookExecutionStatus } from '../types/RunbookExecutionStatus.js';
import type { StepDiagnostics } from './StepDiagnostics.js';
import type { CoverageEntry } from '../types/CoverageEntry.js';

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
 * builder.traceStep('query-logs', 'Search errors', 'data', 'sequential', t0, t1, 1833, 'success', false, input, output, {}, 'continue');
 * builder.traceCaseEvaluation(knownCase, true, { 'vars.statusCode': '504' });
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
   * Records the trace of an executed step.
   *
   */
  traceStep(
    stepId: string,
    label: string,
    kind: StepKind,
    reachedVia: 'sequential' | 'goTo' | 'subPipeline',
    startedAt: string,
    completedAt: string,
    durationMs: number,
    status: 'success' | 'failed' | 'skipped',
    recovered: boolean,
    input: unknown,
    output: unknown,
    varsWritten: Readonly<Record<string, string>>,
    flowDirective: FlowDirectiveString,
    diagnostics?: StepDiagnostics,
    error?: string,
    parentStepId?: string,
  ): void {
    const stepTrace: StepTrace = {
      executionOrder: this.stepTraces.length + 1,
      stepId,
      label,
      kind,
      reachedVia,
      startedAt,
      completedAt,
      durationMs,
      status,
      recovered,
      input,
      output,
      varsWritten,
      flowDirective,
      ...omitUndefined({ diagnostics, error, parentStepId }),
    };

    this.stepTraces.push(stepTrace);
  }

  /**
   * Records the evaluation of a known case.
   *
   */
  traceCaseEvaluation(
    knownCase: KnownCase,
    matched: boolean,
    resolvedValues: Readonly<Record<string, unknown>>,
    match: Pick<CaseEvaluationTrace, 'firstSeenAt' | 'lastSeenAt' | 'evidenceRows' | 'supersededBy' | 'nodeId'> = {},
  ): void {
    this.caseEvaluations.push({
      caseId: knownCase.id,
      description: knownCase.description,
      condition: knownCase.condition,
      matched,
      resolvedValues,
      ...match,
    });
  }

  /**
   * Records the order of the detections, which the trace reports as `matchedCaseIds`.
   *
   * @param caseIds - Ids of the detections, in their order
   */
  traceDetections(caseIds: ReadonlyArray<string>): void {
    this.detectionIds = caseIds;
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
    status: 'success' | 'failed',
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
      ...(resolvedMessage !== undefined ? { resolvedMessage } : {}),
      ...(error !== undefined ? { error } : {}),
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

    const matchedCaseIds = this.detectionIds;

    const variables: Record<string, string> = Object.fromEntries(finalContext.vars);
    const input: Record<string, string> = Object.fromEntries(this.params);

    // Single-pass computation of summary metrics
    const totalSteps = this.runbook.steps.length;
    let stepsExecuted = 0;
    let stepsFailed = 0;
    let stepsRecovered = 0;

    for (const step of this.stepTraces) {
      if (step.status !== 'skipped') {
        stepsExecuted += 1;
      }
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
      this.stepTraces
        .filter((step) => step.status !== 'skipped' && windowIds.has(step.stepId))
        .map((step) => step.stepId),
    );
    const stepsSkipped = totalSteps - executedWindow.size;
    const outcomeCase = matchedCaseIds.length === 0 ? 'no-match' : matchedCaseIds.join(',');
    const primaryActionTrace = this.actionTraces[0];
    const outcomeAction = primaryActionTrace?.actionType ?? 'none';

    const summary: ExecutionSummary = {
      description: this.buildSummaryDescription(status, matchedCaseIds),
      totalSteps,
      stepsExecuted,
      stepsFailed,
      stepsRecovered,
      stepsSkipped,
      outcome: `${outcomeCase} -> ${outcomeAction}`,
    };

    return {
      schemaVersion: '2.0.0',
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
        matchedCaseIds,
      },
      actionsExecuted: this.actionTraces.length > 0 ? this.actionTraces : [TraceBuilder.defaultActionTrace],
      coverage: this.coverage,
      summary,
    };
  }

  /**
   * Builds a human-readable description for the execution summary.
   */
  private buildSummaryDescription(status: RunbookExecutionStatus, matchedCaseIds: ReadonlyArray<string>): string {
    const runbookName = this.runbook.metadata.name;

    if (status === 'failed') {
      return `Runbook "${runbookName}" failed during execution`;
    }

    if (status === 'aborted') {
      return `Runbook "${runbookName}" was aborted`;
    }

    if (matchedCaseIds.length > 0) {
      const descriptions = new Map(
        this.caseEvaluations.map((evaluation) => [evaluation.caseId, evaluation.description]),
      );
      const cases = matchedCaseIds.map((caseId) => `"${descriptions.get(caseId) ?? caseId}"`).join(', ');
      const noun = matchedCaseIds.length === 1 ? 'case' : `${String(matchedCaseIds.length)} cases`;
      return `Runbook "${runbookName}" completed: identified ${noun} ${cases}`;
    }

    return `Runbook "${runbookName}" completed: no known case matched`;
  }
}
