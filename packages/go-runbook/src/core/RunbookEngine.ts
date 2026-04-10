import type { GOLogger } from '@go-automation/go-common/core';
import type { Runbook } from '../types/Runbook.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { RunbookExecutionResult } from '../types/RunbookExecutionResult.js';
import type { StepDescriptor } from '../types/StepDescriptor.js';
import type { StepResult } from '../types/StepResult.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { ErrorRecoveryInfo } from '../types/ErrorRecoveryInfo.js';
import type { FlowDirective, FlowDirectiveString } from '../types/FlowDirective.js';
import type { ServiceRegistry } from '../services/ServiceRegistry.js';
import type { ExecutionEnvironment } from '../trace/ExecutionInfo.js';
import type { EarlyResolutionTrace } from '../trace/EarlyResolutionTrace.js';
import type { CaseEvaluationTrace } from '../trace/CaseEvaluationTrace.js';
import { ConditionEvaluator } from './ConditionEvaluator.js';
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
    const context: RunbookContext = createInitialContext(params, services, signal);
    const maxIterations = runbook.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const env = environment ?? DEFAULT_ENVIRONMENT;

    this.logger.info(`Starting runbook: ${runbook.metadata.name} (${runbook.metadata.id})`);

    let traceBuilder = new TraceBuilder(context.executionId, runbook, params);
    let finalContext: RunbookContext;
    let status: 'completed' | 'failed' | 'aborted' = 'completed';
    let failureReason: string | undefined;

    let earlyResolutionStepId: string | undefined;
    let earlyMatchedCase: KnownCase | undefined;

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
      earlyResolutionStepId = stepsResult.earlyResolution?.resolvedAtStepId;
      earlyMatchedCase = stepsResult.earlyResolution?.matchedCase;
    } catch (error: unknown) {
      if (error instanceof RunbookMaxIterationsError) {
        throw error;
      }
      status = 'failed';
      failureReason = error instanceof Error ? error.message : String(error);
      finalContext = context;
      this.logger.error(`Runbook execution failed: ${failureReason}`);
    }

    // Match known cases
    let matchedCase: KnownCase | undefined;
    if (earlyMatchedCase !== undefined) {
      // Early resolution succeeded — case was already matched during step execution
      matchedCase = earlyMatchedCase;
    } else {
      const caseResult = this.matchKnownCases(runbook.knownCases, finalContext, traceBuilder);
      matchedCase = caseResult.matchedCase;
      traceBuilder = caseResult.traceBuilder;
    }

    // Execute action
    const action = matchedCase?.action ?? runbook.fallbackAction;
    const actionResult = await this.actionExecutor.execute(action, finalContext);
    traceBuilder = traceBuilder.traceAction(
      actionResult.action,
      actionResult.actionType,
      actionResult.status,
      actionResult.durationMs,
      actionResult.resolvedMessage,
      actionResult.error,
    );

    // Build trace
    const trace = traceBuilder.build(finalContext, status, env, failureReason);

    const earlyTag = earlyResolutionStepId !== undefined ? `, early resolution at: ${earlyResolutionStepId}` : '';
    this.logger.info(
      `Runbook completed: ${runbook.metadata.id} in ${trace.execution.durationMs}ms ` +
        `(${finalContext.stepResults.size} steps, case: ${matchedCase?.id ?? 'none'}${earlyTag})`,
    );

    return {
      runbookId: runbook.metadata.id,
      status,
      ...(matchedCase !== undefined ? { matchedCase } : {}),
      durationMs: trace.execution.durationMs,
      stepsExecuted: finalContext.stepResults.size,
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
    earlyResolution?: { matchedCase: KnownCase; resolvedAtStepId: string };
  }> {
    let context = initialContext;
    let traceBuilder = initialTraceBuilder;

    // Index steps by id for goTo support
    const stepIndex = new Map<string, number>();
    for (let i = 0; i < stepDescriptors.length; i++) {
      const descriptor = stepDescriptors[i];
      if (descriptor !== undefined) {
        stepIndex.set(descriptor.step.id, i);
      }
    }

    let currentIndex = 0;
    let iterations = 0;
    let reachedVia: 'sequential' | 'goTo' | 'subPipeline' = 'sequential';
    const visitedSequence: string[] = [];

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
        break;
      }

      const descriptor = stepDescriptors[currentIndex];
      if (descriptor === undefined) {
        break;
      }

      const { step, continueOnFailure } = descriptor;
      visitedSequence.push(step.id);

      // Runtime cycle detection
      if (this.detectRuntimeCycle(visitedSequence)) {
        throw new RunbookMaxIterationsError(runbookId, maxIterations, step.id, visitedSequence);
      }

      this.logger.text(`[${step.id}] ${step.label}`);

      const stepStartTime = Date.now();
      const stepStartedAt = new Date(stepStartTime).toISOString();
      let result: StepResult<unknown>;
      let stepStatus: 'success' | 'failed' | 'skipped' = 'success';
      let recovered = false;

      // Capture input: context snapshot + step-specific trace info
      const baseInput = this.captureStepInput(context);
      const traceInfo = step.getTraceInfo?.(context);
      const stepInput = traceInfo !== undefined ? { ...baseInput, resolvedConfig: traceInfo } : baseInput;

      try {
        result = await step.execute(context);
      } catch (error: unknown) {
        // continueOnFailure support
        if (continueOnFailure === true) {
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

          context = addRecoveredError(context, recoveryInfo);
          stepStatus = 'failed';
          recovered = true;
        } else {
          throw error;
        }
      }

      const stepCompletedAt = new Date().toISOString();
      const stepDurationMs = Date.now() - stepStartTime;

      // Update status for non-recovered failures (step returned success=false without throwing)
      if (!result.success && !recovered) {
        stepStatus = 'failed';
      }

      // Determine flow directive
      const directive = result.next ?? 'continue';
      const flowDirectiveStr = this.flowDirectiveToString(directive);

      const varsWritten: Readonly<Record<string, string>> = result.vars ?? {};

      // Add step trace with full data
      traceBuilder = traceBuilder.traceStep(
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
        flowDirectiveStr,
        result.error,
      );

      // Update context (immutable)
      context = updateContextWithStepResult(context, step.id, result);

      // If step failed with continueOnFailure, proceed to next
      if (result.success === false && continueOnFailure === true) {
        reachedVia = 'sequential';
        currentIndex++;
        continue;
      }

      // Determine next step
      if (directive === 'stop') {
        break;
      } else if (directive === 'resolve') {
        // Early resolution: evaluate known cases against current context
        this.logger.text(`[${step.id}] 'resolve' signal received. Evaluating known cases...`);

        const earlyResult = this.evaluateKnownCasesForEarlyResolution(knownCases, context);
        traceBuilder = traceBuilder.traceEarlyResolution(earlyResult.trace);

        if (earlyResult.matchedCase !== undefined) {
          this.logger.info(
            `[${step.id}] Early resolution succeeded: case "${earlyResult.matchedCase.id}" (${earlyResult.matchedCase.description})`,
          );
          return {
            context,
            traceBuilder,
            earlyResolution: { matchedCase: earlyResult.matchedCase, resolvedAtStepId: step.id },
          };
        }

        this.logger.text(`[${step.id}] 'resolve' signal received but no known case matched. Continuing.`);
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

    return { context, traceBuilder };
  }

  /**
   * Captures the relevant input context for a step.
   * Returns a snapshot of current vars and params for trace purposes.
   *
   * @param context - Current runbook context
   * @returns Input snapshot
   */
  private captureStepInput(context: RunbookContext): Readonly<Record<string, unknown>> {
    const input: Record<string, unknown> = {};

    if (context.vars.size > 0) {
      input['vars'] = Object.fromEntries(context.vars);
    }

    if (context.params.size > 0) {
      input['params'] = Object.fromEntries(context.params);
    }

    return input;
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
   * Detects runtime cycles by analyzing the visited step sequence.
   * Looks for repeated patterns in the tail of the sequence.
   * Requires 3 repetitions of a pattern to confirm a cycle.
   *
   * @param visitedSequence - Sequence of visited step IDs
   * @returns true if a cycle is detected
   */
  private detectRuntimeCycle(visitedSequence: ReadonlyArray<string>): boolean {
    const minCycleLength = 2;
    const maxCycleLength = 20;
    const len = visitedSequence.length;

    for (let cycleLen = minCycleLength; cycleLen <= maxCycleLength; cycleLen++) {
      // Need at least 3 repetitions to confirm
      const requiredLength = cycleLen * 3;
      if (len < requiredLength) {
        continue;
      }

      const offset = len - requiredLength;
      let isCycle = true;

      for (let i = 0; i < cycleLen; i++) {
        const first = visitedSequence[offset + i];
        const second = visitedSequence[offset + i + cycleLen];
        const third = visitedSequence[offset + i + cycleLen * 2];
        if (first !== second || second !== third) {
          isCycle = false;
          break;
        }
      }

      if (isCycle) {
        return true;
      }
    }

    return false;
  }

  /**
   * Core logic for evaluating known cases against a context.
   * Cases are sorted by priority (descending). The first match wins.
   *
   * @param knownCases - Known cases to evaluate
   * @param context - Current runbook context
   * @param evaluateAll - If true, continues evaluating all cases after the first match (for full trace).
   *                      If false, short-circuits on the first match.
   * @returns Matched case and all evaluation traces
   */
  private evaluateKnownCasesCore(
    knownCases: ReadonlyArray<KnownCase>,
    context: RunbookContext,
    evaluateAll: boolean,
  ): { matchedCase: KnownCase | undefined; evaluations: CaseEvaluationTrace[] } {
    const sorted = [...knownCases].sort((a, b) => b.priority - a.priority);
    const evaluations: CaseEvaluationTrace[] = [];
    let matchedCase: KnownCase | undefined;

    for (const knownCase of sorted) {
      const matched = this.conditionEvaluator.evaluate(knownCase.condition, context);
      const resolvedValues = this.conditionEvaluator.collectResolvedValues(knownCase.condition, context);

      evaluations.push({
        caseId: knownCase.id,
        description: knownCase.description,
        priority: knownCase.priority,
        condition: knownCase.condition,
        matched,
        resolvedValues,
      });

      if (matched && matchedCase === undefined) {
        matchedCase = knownCase;
        if (!evaluateAll) {
          break;
        }
      }
    }

    return { matchedCase, evaluations };
  }

  /**
   * Evaluates known cases during step execution for early resolution.
   * Evaluates all cases (even after a match) to produce a complete trace.
   *
   * @param knownCases - Known cases to evaluate
   * @param context - Current context at the time of the resolve signal
   * @returns Matched case (if any) and the early resolution trace
   */
  private evaluateKnownCasesForEarlyResolution(
    knownCases: ReadonlyArray<KnownCase>,
    context: RunbookContext,
  ): { matchedCase: KnownCase | undefined; trace: EarlyResolutionTrace } {
    const { matchedCase, evaluations } = this.evaluateKnownCasesCore(knownCases, context, true);

    return {
      matchedCase,
      trace: {
        resolved: matchedCase !== undefined,
        ...(matchedCase !== undefined ? { matchedCaseId: matchedCase.id } : {}),
        evaluations,
      },
    };
  }

  /**
   * Evaluates known cases against the final context.
   * Short-circuits on the first match. Traces each evaluation via TraceBuilder.
   */
  private matchKnownCases(
    knownCases: ReadonlyArray<KnownCase>,
    context: RunbookContext,
    initialTraceBuilder: TraceBuilder,
  ): { matchedCase: KnownCase | undefined; traceBuilder: TraceBuilder } {
    const { matchedCase, evaluations } = this.evaluateKnownCasesCore(knownCases, context, false);

    // Build a lookup for the original KnownCase objects (needed by traceCaseEvaluation)
    const caseById = new Map<string, KnownCase>();
    for (const kc of knownCases) {
      caseById.set(kc.id, kc);
    }

    let traceBuilder = initialTraceBuilder;
    for (const evaluation of evaluations) {
      const originalCase = caseById.get(evaluation.caseId);
      if (originalCase !== undefined) {
        traceBuilder = traceBuilder.traceCaseEvaluation(originalCase, evaluation.matched, evaluation.resolvedValues);
      }
    }

    if (matchedCase !== undefined) {
      this.logger.success(`Known case identified: ${matchedCase.description}`);
    } else {
      this.logger.warning('No known case matches the result.');
    }

    return { matchedCase, traceBuilder };
  }
}
