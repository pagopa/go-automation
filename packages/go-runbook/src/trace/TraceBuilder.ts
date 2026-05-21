import type { StepKind } from '../types/StepKind.js';
import type { StepTrace } from './StepTrace.js';
import type { CaseEvaluationTrace } from './CaseEvaluationTrace.js';
import type { EarlyResolutionTrace } from './EarlyResolutionTrace.js';
import type { ActionTrace, ActionType } from './ActionTrace.js';
import type { ExecutionSummary } from './ExecutionSummary.js';
import type { ExecutionEnvironment } from './ExecutionInfo.js';
import type { RunbookExecutionTrace } from './RunbookExecutionTrace.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { Runbook } from '../types/Runbook.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { CaseAction } from '../actions/CaseAction.js';
import type { FlowDirectiveString } from '../types/FlowDirective.js';
import type { RunbookExecutionStatus } from '../types/RunbookExecutionStatus.js';

/**
 * Builder for the {@link RunbookExecutionTrace}.
 *
 * The trace API is exposed as a fluent, immutable chain
 * (`builder = builder.traceStep(...)`) to keep call sites readable and
 * allow future replacement with a true persistent builder. Internally the
 * collections are mutated in place — the engine drives the builder
 * sequentially in a single goroutine-equivalent context, so allocating a
 * fresh builder + spread-cloned array on every step would be wasteful
 * (the trace can contain hundreds of step entries). Each `trace*` method
 * returns `this`, so the caller's reassignment stays valid.
 *
 * @example
 * ```typescript
 * const builder = new TraceBuilder('exec-123', runbook, params)
 *   .traceStep('query-logs', 'Search errors', 'data', 'sequential', t0, t1, 1833, 'success', false, input, output, {}, 'continue')
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

  private readonly stepTraces: StepTrace[] = [];
  private readonly caseEvaluations: CaseEvaluationTrace[] = [];
  private readonly actionTraces: ActionTrace[] = [];
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
   * @returns this
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

    this.stepTraces.push(stepTrace);
    return this;
  }

  /**
   * Attaches an early resolution result to the most recent step trace.
   *
   * When the early resolution **actually matched** at least one case,
   * the evaluations from that resolution are also promoted into the
   * top-level `caseEvaluations` so {@link build} derives `matchedCaseIds`
   * and `summary.outcomeCase` correctly. Failed early resolutions
   * (no match found at that point) stay confined to the step's
   * `earlyResolution` detail.
   *
   * @returns this
   */
  traceEarlyResolution(earlyResolution: EarlyResolutionTrace): TraceBuilder {
    const lastIndex = this.stepTraces.length - 1;
    if (lastIndex < 0) return this;

    const lastStep = this.stepTraces[lastIndex];
    if (lastStep === undefined) return this;

    this.stepTraces[lastIndex] = { ...lastStep, earlyResolution };

    if (earlyResolution.resolved && earlyResolution.evaluations.length > 0) {
      // The early resolution carries the full evaluation list (in priority
      // order) for the cases that matched at that point. Replace the
      // current builder snapshot so `build()` reports the resolution.
      this.caseEvaluations.length = 0;
      this.caseEvaluations.push(...earlyResolution.evaluations);
    }

    return this;
  }

  /**
   * Records the evaluation of a known case.
   *
   * @returns this
   */
  traceCaseEvaluation(
    knownCase: KnownCase,
    matched: boolean,
    resolvedValues: Readonly<Record<string, unknown>>,
  ): TraceBuilder {
    this.caseEvaluations.push({
      caseId: knownCase.id,
      description: knownCase.description,
      priority: knownCase.priority,
      condition: knownCase.condition,
      matched,
      resolvedValues,
    });
    return this;
  }

  /**
   * Records the result of an executed action.
   *
   * @returns this
   */
  traceAction(
    action: CaseAction,
    actionType: ActionType,
    status: 'success' | 'failed',
    durationMs: number,
    resolvedMessage?: string,
    error?: string,
  ): TraceBuilder {
    this.actionTraces.push({
      executed: true,
      actionType,
      actionDetail: action,
      status,
      durationMs,
      ...(resolvedMessage !== undefined ? { resolvedMessage } : {}),
      ...(error !== undefined ? { error } : {}),
    });
    return this;
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

    const matchedCaseIds = this.caseEvaluations.filter((e) => e.matched).map((e) => e.caseId);
    const matchedEval = this.caseEvaluations.find((e) => e.matched) ?? null;

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
    const outcomeCase = matchedCaseIds.length === 0 ? 'no-match' : matchedCaseIds.join(',');
    const primaryActionTrace = this.actionTraces[0];
    const outcomeAction = primaryActionTrace?.actionType ?? 'none';

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
        matchedCaseIds,
      },
      actionsExecuted: this.actionTraces.length > 0 ? this.actionTraces : [TraceBuilder.defaultActionTrace],
      summary,
    };
  }

  /**
   * Builds a human-readable description for the execution summary.
   */
  private buildSummaryDescription(
    status: RunbookExecutionStatus,
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
