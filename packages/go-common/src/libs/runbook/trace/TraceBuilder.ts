import type { StepKind } from '../types/StepKind.js';
import type { StepTrace } from './StepTrace.js';
import type { CaseEvaluationTrace } from './CaseEvaluationTrace.js';
import type { EarlyResolutionTrace } from './EarlyResolutionTrace.js';
import type { ActionTrace } from './ActionTrace.js';
import type { ExecutionSummary } from './ExecutionSummary.js';
import type { ExecutionEnvironment } from './ExecutionInfo.js';
import type { RunbookExecutionTrace } from './RunbookExecutionTrace.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { Runbook } from '../types/Runbook.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { CaseAction } from '../actions/CaseAction.js';
import type { FlowDirectiveString } from '../types/FlowDirective.js';

/**
 * Immutable builder for constructing a RunbookExecutionTrace.
 * Collects data during runbook execution and assembles the final trace.
 *
 * Pattern: every `trace*` method returns a new builder instance
 * without mutating the internal state (functional approach).
 *
 * @example
 * ```typescript
 * const builder = new TraceBuilder('exec-123', runbook, params)
 *   .traceStep('query-logs', 'Search errors', 'data', 'sequential', t0, t1, 1833, 'success', false, input, output, {}, 'continue')
 *   .traceStep('extract-field', 'Extract field', 'transform', 'sequential', t1, t2, 1, 'success', false, input, '504', { statusCode: '504' }, 'continue')
 *   .traceCaseEvaluation(knownCase, true, { 'vars.statusCode': '504' })
 *   .traceAction(action, 'notify', 'success', 120);
 *
 * const trace = builder.build(finalContext, 'completed', environment);
 * ```
 */
export class TraceBuilder {
  private static readonly defaultActionTrace: ActionTrace = {
    executed: false,
    actionType: 'fallback',
    actionDetail: { type: 'log', level: 'warn', message: 'Nessuna azione eseguita' },
    status: 'success',
    durationMs: 0,
  };

  private readonly stepTraces: ReadonlyArray<StepTrace>;
  private readonly caseEvaluations: ReadonlyArray<CaseEvaluationTrace>;
  private readonly actionResult: ActionTrace | null;
  private readonly startedAt: string;
  private readonly startedAtMs: number;

  constructor(
    private readonly executionId: string,
    private readonly runbook: Runbook,
    private readonly params: ReadonlyMap<string, string>,
  ) {
    this.stepTraces = [];
    this.caseEvaluations = [];
    this.actionResult = null;
    const now = new Date();
    this.startedAt = now.toISOString();
    this.startedAtMs = now.getTime();
  }

  /**
   * Creates a new instance with updated state (immutability).
   */
  private copyWith(overrides: {
    readonly stepTraces?: ReadonlyArray<StepTrace>;
    readonly caseEvaluations?: ReadonlyArray<CaseEvaluationTrace>;
    readonly actionResult?: ActionTrace | null;
  }): TraceBuilder {
    const copy = new TraceBuilder(this.executionId, this.runbook, this.params);
    return Object.assign(copy, {
      stepTraces: overrides.stepTraces ?? this.stepTraces,
      caseEvaluations: overrides.caseEvaluations ?? this.caseEvaluations,
      actionResult: overrides.actionResult ?? this.actionResult,
      startedAt: this.startedAt,
      startedAtMs: this.startedAtMs,
    });
  }

  /**
   * Records the trace of an executed step.
   * Called by RunbookEngine after each step.execute().
   *
   * @param stepId - Step ID
   * @param label - Human-readable label
   * @param kind - Step category
   * @param reachedVia - How the step was reached
   * @param startedAt - Start timestamp (ISO 8601)
   * @param completedAt - Completion timestamp (ISO 8601)
   * @param durationMs - Duration in milliseconds
   * @param status - Step status
   * @param recovered - Whether the step was recovered
   * @param input - Input provided to the step
   * @param output - Output produced by the step
   * @param varsWritten - Variables written to the context
   * @param flowDirective - Flow directive produced
   * @param error - Optional error message
   * @param parentStepId - Parent step ID for sub-pipeline
   * @returns New builder instance with the step added
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
    error?: string,
    parentStepId?: string,
  ): TraceBuilder {
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
      ...(error !== undefined ? { error } : {}),
      ...(parentStepId !== undefined ? { parentStepId } : {}),
    };

    return this.copyWith({
      stepTraces: [...this.stepTraces, stepTrace],
    });
  }

  /**
   * Attaches an early resolution result to the last step trace.
   * Called by RunbookEngine when a step signals `'resolve'`.
   *
   * @param earlyResolution - The early resolution trace to attach
   * @returns New builder instance with the early resolution recorded
   */
  traceEarlyResolution(earlyResolution: EarlyResolutionTrace): TraceBuilder {
    if (this.stepTraces.length === 0) {
      return this;
    }

    const lastIndex = this.stepTraces.length - 1;
    const updatedTraces = this.stepTraces.map((step, idx) => (idx === lastIndex ? { ...step, earlyResolution } : step));
    return this.copyWith({ stepTraces: updatedTraces });
  }

  /**
   * Records the evaluation of a known case.
   * Called by RunbookEngine during matchKnownCases().
   *
   * @param knownCase - The known case evaluated
   * @param matched - Whether the condition matched
   * @param resolvedValues - Actual values of the variables in the condition
   * @returns New builder instance with the evaluation added
   */
  traceCaseEvaluation(
    knownCase: KnownCase,
    matched: boolean,
    resolvedValues: Readonly<Record<string, unknown>>,
  ): TraceBuilder {
    const evaluation: CaseEvaluationTrace = {
      caseId: knownCase.id,
      description: knownCase.description,
      priority: knownCase.priority,
      condition: knownCase.condition,
      matched,
      resolvedValues,
    };

    return this.copyWith({
      caseEvaluations: [...this.caseEvaluations, evaluation],
    });
  }

  /**
   * Records the result of the executed action.
   * Called by RunbookEngine after executeAction().
   *
   * @param action - The action executed
   * @param actionType - Action type
   * @param status - Execution status
   * @param durationMs - Duration in milliseconds
   * @param resolvedMessage - Message with resolved variables
   * @param error - Optional error message
   * @returns New builder instance with the action recorded
   */
  traceAction(
    action: CaseAction,
    actionType: ActionTrace['actionType'],
    status: 'success' | 'failed',
    durationMs: number,
    resolvedMessage?: string,
    error?: string,
  ): TraceBuilder {
    const actionTrace: ActionTrace = {
      executed: true,
      actionType,
      actionDetail: action,
      status,
      durationMs,
      ...(resolvedMessage !== undefined ? { resolvedMessage } : {}),
      ...(error !== undefined ? { error } : {}),
    };

    return this.copyWith({
      actionResult: actionTrace,
    });
  }

  /**
   * Assembles the final execution trace.
   * Called by RunbookEngine at the end of execute().
   *
   * @param finalContext - Final context after all steps
   * @param status - Final execution status
   * @param environment - Execution environment information
   * @param failureReason - Optional failure reason
   * @returns The complete structured trace
   */
  build(
    finalContext: RunbookContext,
    status: 'completed' | 'failed' | 'aborted',
    environment: ExecutionEnvironment,
    failureReason?: string,
  ): RunbookExecutionTrace {
    const completedAtDate = new Date();
    const completedAt = completedAtDate.toISOString();
    const durationMs = completedAtDate.getTime() - this.startedAtMs;

    const matchedEval = this.caseEvaluations.find((e) => e.matched) ?? null;
    const matchedCaseId = matchedEval?.caseId ?? null;

    const variables: Record<string, string> = Object.fromEntries(finalContext.vars);
    const input: Record<string, string> = Object.fromEntries(this.params);

    // Single-pass computation of summary metrics + early resolution detection
    const totalSteps = this.runbook.steps.length;
    let stepsExecuted = 0;
    let stepsFailed = 0;
    let stepsRecovered = 0;
    let earlyResolvedStep: StepTrace | null = null;

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
      if (step.earlyResolution?.resolved === true && earlyResolvedStep === null) {
        earlyResolvedStep = step;
      }
    }

    const stepsSkipped = totalSteps - stepsExecuted;
    const outcomeCase = matchedCaseId ?? 'no-match';
    const outcomeAction = this.actionResult?.actionType ?? 'none';

    const summary: ExecutionSummary = {
      description: this.buildSummaryDescription(status, matchedEval, earlyResolvedStep?.stepId),
      totalSteps,
      stepsExecuted,
      stepsFailed,
      stepsRecovered,
      stepsSkipped,
      outcome: `${outcomeCase} -> ${outcomeAction}`,
      ...(earlyResolvedStep !== null ? { earlyResolution: true, resolvedAtStep: earlyResolvedStep.stepId } : {}),
    };

    return {
      schemaVersion: '1.0.0',
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
        matchedCaseId,
      },
      actionExecuted: this.actionResult ?? TraceBuilder.defaultActionTrace,
      summary,
    };
  }

  /**
   * Builds a human-readable description for the execution summary.
   *
   * @param status - Execution status
   * @param matchedEval - Matched case evaluation (null if none)
   * @param resolvedAtStepId - Step ID where early resolution occurred
   * @returns Description string
   */
  private buildSummaryDescription(
    status: 'completed' | 'failed' | 'aborted',
    matchedEval: CaseEvaluationTrace | null,
    resolvedAtStepId?: string,
  ): string {
    const runbookName = this.runbook.metadata.name;

    if (status === 'failed') {
      return `Runbook "${runbookName}" failed during execution`;
    }

    if (status === 'aborted') {
      return `Runbook "${runbookName}" was aborted`;
    }

    if (matchedEval !== null) {
      const caseDesc = matchedEval.description;
      const earlyTag = resolvedAtStepId !== undefined ? ` (early resolution at "${resolvedAtStepId}")` : '';
      return `Runbook "${runbookName}" completed: identified case "${caseDesc}"${earlyTag}`;
    }

    return `Runbook "${runbookName}" completed: no known case matched`;
  }
}
