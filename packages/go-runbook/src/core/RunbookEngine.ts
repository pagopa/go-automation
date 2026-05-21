import type { GOLogger } from '@go-automation/go-common/core';
import type { Runbook } from '../types/Runbook.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { RunbookExecutionResult } from '../types/RunbookExecutionResult.js';
import type { StepDescriptor } from '../types/StepDescriptor.js';
import type { StepResult } from '../types/StepResult.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { ErrorRecoveryInfo } from '../types/ErrorRecoveryInfo.js';
import type { FlowDirective, FlowDirectiveString } from '../types/FlowDirective.js';
import type { RunbookExecutionStatus } from '../types/RunbookExecutionStatus.js';
import type { ServiceRegistry } from '../services/ServiceRegistry.js';
import type { ExecutionEnvironment } from '../trace/ExecutionInfo.js';
import type { EarlyResolutionTrace } from '../trace/EarlyResolutionTrace.js';
import type { CaseEvaluationTrace } from '../trace/CaseEvaluationTrace.js';
import { ConditionEvaluator } from './ConditionEvaluator.js';
import { buildStepIndex } from './buildStepIndex.js';
import { detectRuntimeCycle } from './detectRuntimeCycle.js';
import { ActionExecutor } from '../actions/ActionExecutor.js';
import { TraceBuilder } from '../trace/TraceBuilder.js';
import { RunbookMaxIterationsError } from '../errors/RunbookMaxIterationsError.js';
import {
  createInitialContext,
  updateContextWithStepResult,
  addRecoveredError,
} from '../context/RunbookContextHelper.js';

/** Default maximum iterations for anti-loop protection */
const DEFAULT_MAX_ITERATIONS = 1000;

/** Default execution environment when none is provided */
const DEFAULT_ENVIRONMENT: ExecutionEnvironment = {
  awsProfiles: [],
  region: 'eu-south-1',
  invokedBy: 'manual',
};

type ReachedVia = 'sequential' | 'goTo' | 'subPipeline';
type StepTraceStatus = 'success' | 'failed' | 'skipped';

interface StepExecutionOutcome {
  readonly context: RunbookContext;
  readonly traceBuilder: TraceBuilder;
  readonly result: StepResult<unknown>;
}

/**
 * Main runbook execution engine.
 * Orchestrates step execution, flow control, case matching, and actions.
 *
 * features:
 * - Anti-loop protection with maxIterations
 * - continueOnFailure support for resilient steps
 * - Sub-pipeline execution for inline branching
 * - Detailed execution tracing with full input/output/vars
 * - Early resolution via 'resolve' FlowDirective
 * - Intermediate known case evaluation during step execution
 *
 * @example
 * ```typescript
 * const engine = new RunbookEngine(logger, new ConditionEvaluator());
 * const result = await engine.execute(runbook, params, services);
 * ```
 */
export class RunbookEngine {
  private readonly actionExecutor: ActionExecutor;

  constructor(
    private readonly logger: GOLogger,
    private readonly conditionEvaluator: ConditionEvaluator,
  ) {
    this.actionExecutor = new ActionExecutor(logger);
  }

  /**
   * Executes a complete runbook.
   *
   * Flow:
   * 1. Initialize context with input parameters
   * 2. Execute steps in sequence (respecting FlowDirectives)
   * 3. Evaluate known cases in priority order
   * 4. Execute the matching case action (or fallback)
   * 5. Build and return execution result with trace
   *
   * @param runbook - Runbook definition to execute
   * @param params - Input parameters (alarmName, timeRange, etc.)
   * @param services - AWS/HTTP service registry
   * @param environment - Execution environment info (optional)
   * @param signal - Optional abort signal to cancel the execution
   * @returns Complete execution result with trace
   * @throws RunbookMaxIterationsError if iteration limit is exceeded
   */
  async execute(
    runbook: Runbook,
    params: ReadonlyMap<string, string>,
    services: ServiceRegistry,
    environment?: ExecutionEnvironment,
    signal?: AbortSignal,
  ): Promise<RunbookExecutionResult> {
    const context: RunbookContext = createInitialContext(params, services, signal, this.logger);
    const maxIterations = runbook.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const env = environment ?? DEFAULT_ENVIRONMENT;

    this.logger.info(`Starting runbook: ${runbook.metadata.name} (${runbook.metadata.id})`);

    let traceBuilder = new TraceBuilder(context.executionId, runbook, params);
    let finalContext: RunbookContext;
    let status: RunbookExecutionStatus = 'completed';
    let failureReason: string | undefined;

    let earlyResolutionStepId: string | undefined;
    let earlyMatchedCases: ReadonlyArray<KnownCase> = [];

    try {
      const stepsResult = await this.executeSteps(
        runbook.steps,
        context,
        maxIterations,
        runbook.metadata.id,
        traceBuilder,
        runbook.knownCases,
      );
      finalContext = stepsResult.context;
      traceBuilder = stepsResult.traceBuilder;
      if (stepsResult.aborted) {
        status = 'aborted';
        failureReason = 'Execution aborted by signal';
      } else if (stepsResult.failureReason !== undefined) {
        status = 'failed';
        failureReason = stepsResult.failureReason;
        this.logger.error(`Runbook execution failed: ${failureReason}`);
      }
      earlyResolutionStepId = stepsResult.earlyResolution?.resolvedAtStepId;
      earlyMatchedCases = stepsResult.earlyResolution?.matchedCases ?? [];
    } catch (error: unknown) {
      if (error instanceof RunbookMaxIterationsError) {
        throw error;
      }
      if (context.signal?.aborted === true) {
        status = 'aborted';
        failureReason = 'Execution aborted by signal';
        this.logger.warning('Runbook execution aborted by signal');
      } else {
        status = 'failed';
        failureReason = error instanceof Error ? error.message : String(error);
        this.logger.error(`Runbook execution failed: ${failureReason}`);
      }
      finalContext = context;
    }

    // Collect every matched known case. Early resolution wins when it
    // already produced matches (we don't re-evaluate at the end since
    // the pipeline was short-circuited at that point).
    let matchedCases: ReadonlyArray<KnownCase>;
    if (status !== 'completed') {
      matchedCases = [];
    } else if (earlyMatchedCases.length > 0) {
      matchedCases = earlyMatchedCases;
    } else {
      const caseResult = this.matchKnownCases(runbook.knownCases, finalContext, traceBuilder);
      matchedCases = caseResult.matchedCases;
      traceBuilder = caseResult.traceBuilder;
    }

    // Execute only the primary matched action. `matchedCases` still keeps
    // every overlap for trace/reporting, but actions may notify/escalate/update
    // and must not fan out implicitly. Fallback runs only when nothing matched.
    if (status === 'completed') {
      const primaryAction = matchedCases[0]?.action ?? runbook.fallbackAction;
      const actionResult = await this.actionExecutor.execute(primaryAction, finalContext);
      traceBuilder = traceBuilder.traceAction(
        actionResult.action,
        actionResult.actionType,
        actionResult.status,
        actionResult.durationMs,
        actionResult.resolvedMessage,
        actionResult.error,
      );
    }

    // Build trace
    const trace = traceBuilder.build(finalContext, status, env, failureReason);

    const earlyTag = earlyResolutionStepId !== undefined ? `, early resolution at: ${earlyResolutionStepId}` : '';
    const caseTag = matchedCases.length === 0 ? 'none' : matchedCases.map((c) => c.id).join(', ');
    this.logger.info(
      `Runbook ${status}: ${runbook.metadata.id} in ${trace.execution.durationMs}ms ` +
        `(${finalContext.stepResults.size} steps, cases: ${caseTag}${earlyTag})`,
    );

    return {
      runbookId: runbook.metadata.id,
      status,
      matchedCases,
      durationMs: trace.execution.durationMs,
      stepsExecuted: trace.summary.stepsExecuted,
      finalContext,
      recoveredErrors: finalContext.recoveredErrors,
      trace,
      ...(earlyResolutionStepId !== undefined ? { earlyResolution: true, resolvedAtStep: earlyResolutionStepId } : {}),
    };
  }

  /**
   * Executes steps in sequence respecting FlowDirectives.
   * Includes anti-loop protection, continueOnFailure support,
   * and early resolution via 'resolve' signal.
   */
  private async executeSteps(
    stepDescriptors: ReadonlyArray<StepDescriptor>,
    initialContext: RunbookContext,
    maxIterations: number,
    runbookId: string,
    initialTraceBuilder: TraceBuilder,
    knownCases: ReadonlyArray<KnownCase>,
  ): Promise<{
    context: RunbookContext;
    traceBuilder: TraceBuilder;
    earlyResolution?: { matchedCases: ReadonlyArray<KnownCase>; resolvedAtStepId: string };
    aborted: boolean;
    failureReason?: string;
  }> {
    let context = initialContext;
    let traceBuilder = initialTraceBuilder;

    const stepIndex = buildStepIndex(stepDescriptors);

    let currentIndex = 0;
    let iterations = 0;
    let reachedVia: ReachedVia = 'sequential';
    const visitedSequence: string[] = [];
    let aborted = false;

    while (currentIndex < stepDescriptors.length) {
      // Anti-loop protection
      iterations++;
      if (iterations > maxIterations) {
        const lastStepId = visitedSequence[visitedSequence.length - 1] ?? 'unknown';
        throw new RunbookMaxIterationsError(runbookId, maxIterations, lastStepId, visitedSequence);
      }

      // Abort check before each step
      if (context.signal?.aborted === true) {
        this.logger.warning('Runbook execution aborted by signal');
        aborted = true;
        break;
      }

      const descriptor = stepDescriptors[currentIndex];
      if (descriptor === undefined) {
        break;
      }

      const { step, continueOnFailure } = descriptor;
      visitedSequence.push(step.id);

      // Runtime cycle detection
      if (detectRuntimeCycle(visitedSequence)) {
        throw new RunbookMaxIterationsError(runbookId, maxIterations, step.id, visitedSequence);
      }

      const execution = await this.executeStepDescriptor(descriptor, context, reachedVia, traceBuilder);
      context = execution.context;
      traceBuilder = execution.traceBuilder;
      const result = execution.result;

      const directive = result.next ?? 'continue';

      // If step failed with continueOnFailure, proceed to next
      if (result.success === false && continueOnFailure === true) {
        reachedVia = 'sequential';
        currentIndex++;
        continue;
      }

      if (result.success === false) {
        return {
          context,
          traceBuilder,
          aborted: false,
          failureReason: result.error ?? `Step "${step.id}" failed without an error message.`,
        };
      }

      // Determine next step
      if (directive === 'stop') {
        break;
      } else if (directive === 'resolve') {
        // Early resolution: evaluate known cases against current context
        if (descriptor.silent !== true) {
          this.logger.text(`[${step.id}] 'resolve' signal received. Evaluating known cases...`);
        }

        const earlyResult = this.evaluateKnownCasesForEarlyResolution(knownCases, context);
        traceBuilder = traceBuilder.traceEarlyResolution(earlyResult.trace);

        if (earlyResult.matchedCases.length > 0) {
          if (descriptor.silent !== true) {
            const caseList = earlyResult.matchedCases.map((c) => `"${c.id}" (${c.description})`).join(', ');
            this.logger.info(`[${step.id}] Early resolution succeeded: cases matched: ${caseList}`);
          }
          return {
            context,
            traceBuilder,
            earlyResolution: { matchedCases: earlyResult.matchedCases, resolvedAtStepId: step.id },
            aborted: false,
          };
        }

        if (descriptor.silent !== true) {
          this.logger.text(`[${step.id}] 'resolve' signal received but no known case matched. Continuing.`);
        }
        reachedVia = 'sequential';
        currentIndex++;
      } else if (directive === 'continue') {
        reachedVia = 'sequential';
        currentIndex++;
      } else {
        // goTo
        const targetIndex = stepIndex.get(directive.goTo);
        if (targetIndex === undefined) {
          throw new Error(`Step not found: ${directive.goTo}`);
        }
        reachedVia = 'goTo';
        currentIndex = targetIndex;
      }
    }

    return { context, traceBuilder, aborted };
  }

  private async executeStepDescriptor(
    descriptor: StepDescriptor,
    context: RunbookContext,
    reachedVia: ReachedVia,
    traceBuilder: TraceBuilder,
  ): Promise<StepExecutionOutcome> {
    const { step, continueOnFailure } = descriptor;

    if (descriptor.silent !== true) {
      this.logger.text(`[${step.id}] ${step.label}`);
    }

    const stepStartTime = Date.now();
    const stepStartedAt = new Date(stepStartTime).toISOString();
    let result: StepResult<unknown>;
    let stepStatus: StepTraceStatus = 'success';
    let recovered = false;
    let updatedContext = context;

    const baseInput = this.captureStepInput(context);
    const traceInfo = step.getTraceInfo?.(context);
    const stepInput = traceInfo !== undefined ? { ...baseInput, resolvedConfig: traceInfo } : baseInput;

    try {
      result = await step.execute(context);
    } catch (error: unknown) {
      if (continueOnFailure !== true) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warning(`[${step.id}] Step failed but continueOnFailure=true: ${errorMessage}`);

      const recoveryInfo: ErrorRecoveryInfo = {
        stepId: step.id,
        originalError: errorMessage,
        failedAt: new Date(),
        skipped: true,
      };

      result = {
        success: false,
        error: errorMessage,
        errorRecovery: recoveryInfo,
      };

      updatedContext = addRecoveredError(context, recoveryInfo);
      stepStatus = 'failed';
      recovered = true;
    }

    const stepCompletedAt = new Date().toISOString();
    const stepDurationMs = Date.now() - stepStartTime;

    if (!result.success && !recovered) {
      stepStatus = 'failed';
    }

    const directive = result.next ?? 'continue';
    const varsWritten: Readonly<Record<string, string>> = result.vars ?? {};
    const nextTraceBuilder = traceBuilder.traceStep(
      step.id,
      step.label,
      step.kind,
      reachedVia,
      stepStartedAt,
      stepCompletedAt,
      stepDurationMs,
      stepStatus,
      recovered,
      stepInput,
      result.output ?? null,
      varsWritten,
      this.flowDirectiveToString(directive),
      result.error,
    );

    return {
      context: updateContextWithStepResult(updatedContext, step.id, result),
      traceBuilder: nextTraceBuilder,
      result,
    };
  }

  /**
   * Captures the relevant input context for a step.
   *
   * Snapshots only `vars` (which mutate step-by-step). `params` are immutable
   * across the execution and are already serialised once at the top level of
   * the trace (`trace.input`), so duplicating them per step would be O(N·P)
   * waste with no diagnostic value.
   *
   * @param context - Current runbook context
   * @returns Input snapshot scoped to mutable state
   */
  private captureStepInput(context: RunbookContext): Readonly<Record<string, unknown>> {
    if (context.vars.size === 0) {
      return {};
    }
    return { vars: Object.fromEntries(context.vars) };
  }

  /**
   * Converts a FlowDirective to its string representation for trace.
   *
   * @param directive - Flow directive
   * @returns String representation
   */
  private flowDirectiveToString(directive: FlowDirective): FlowDirectiveString {
    if (directive === 'continue' || directive === 'stop' || directive === 'resolve') {
      return directive;
    }
    return directive.goTo;
  }

  /**
   * Core logic for evaluating known cases against a context.
   * Cases are evaluated in priority-descending order; **every** match is
   * collected (no short-circuit) so the caller can react to overlapping
   * cases.
   *
   * @param knownCases - Known cases to evaluate
   * @param context - Current runbook context
   * @returns All matched cases (priority desc) and the full evaluation trace
   */
  private evaluateKnownCasesCore(
    knownCases: ReadonlyArray<KnownCase>,
    context: RunbookContext,
  ): {
    matchedCases: ReadonlyArray<KnownCase>;
    sortedCases: ReadonlyArray<KnownCase>;
    evaluations: CaseEvaluationTrace[];
  } {
    const sortedCases = [...knownCases].sort((a, b) => b.priority - a.priority);
    const evaluations: CaseEvaluationTrace[] = [];
    const matchedCases: KnownCase[] = [];

    for (const knownCase of sortedCases) {
      const { matched, resolvedValues } = this.conditionEvaluator.evaluateWithResolvedValues(
        knownCase.condition,
        context,
      );

      evaluations.push({
        caseId: knownCase.id,
        description: knownCase.description,
        priority: knownCase.priority,
        condition: knownCase.condition,
        matched,
        resolvedValues,
      });

      if (matched) {
        matchedCases.push(knownCase);
      }
    }

    return { matchedCases, sortedCases, evaluations };
  }

  /**
   * Evaluates known cases during step execution for early resolution.
   * Returns every case that matched (sorted by priority desc) plus the
   * complete evaluation trace.
   *
   * @param knownCases - Known cases to evaluate
   * @param context - Current context at the time of the resolve signal
   * @returns Matched cases (possibly empty) and the early resolution trace
   */
  private evaluateKnownCasesForEarlyResolution(
    knownCases: ReadonlyArray<KnownCase>,
    context: RunbookContext,
  ): { matchedCases: ReadonlyArray<KnownCase>; trace: EarlyResolutionTrace } {
    const { matchedCases, evaluations } = this.evaluateKnownCasesCore(knownCases, context);
    // `sortedCases` is not needed here: the early-resolution trace only
    // carries the evaluations and the matched case ids.

    return {
      matchedCases,
      trace: {
        resolved: matchedCases.length > 0,
        matchedCaseIds: matchedCases.map((c) => c.id),
        evaluations,
      },
    };
  }

  /**
   * Evaluates known cases against the final context. Collects every
   * matching case and traces every evaluation via TraceBuilder.
   */
  private matchKnownCases(
    knownCases: ReadonlyArray<KnownCase>,
    context: RunbookContext,
    initialTraceBuilder: TraceBuilder,
  ): { matchedCases: ReadonlyArray<KnownCase>; traceBuilder: TraceBuilder } {
    const { matchedCases, sortedCases, evaluations } = this.evaluateKnownCasesCore(knownCases, context);

    // `sortedCases[i]` corresponds to `evaluations[i]` by construction, so we
    // can pair them up directly without a separate id→case lookup map.
    let traceBuilder = initialTraceBuilder;
    for (let i = 0; i < evaluations.length; i++) {
      const knownCase = sortedCases[i];
      const evaluation = evaluations[i];
      if (knownCase !== undefined && evaluation !== undefined) {
        traceBuilder = traceBuilder.traceCaseEvaluation(knownCase, evaluation.matched, evaluation.resolvedValues);
      }
    }

    const [primary, ...rest] = matchedCases;
    if (primary !== undefined) {
      const description =
        rest.length === 0
          ? `Known case identified: ${primary.description}`
          : `Known cases identified (${matchedCases.length}): ${matchedCases.map((c) => c.description).join(' | ')}`;
      this.logger.success(description);
    }

    return { matchedCases, traceBuilder };
  }
}
