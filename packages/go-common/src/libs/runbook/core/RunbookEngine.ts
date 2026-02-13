import type { GOLogger } from '../../core/logging/GOLogger.js';
import type { Runbook } from '../types/Runbook.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { RunbookExecutionResult } from '../types/RunbookExecutionResult.js';
import type { StepDescriptor } from '../types/StepDescriptor.js';
import type { StepResult } from '../types/StepResult.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { ErrorRecoveryInfo } from '../types/ErrorRecoveryInfo.js';
import type { ServiceRegistry } from '../services/ServiceRegistry.js';
import type { StepTrace } from '../trace/StepTrace.js';
import type { CaseMatchingTrace } from '../trace/CaseMatchingTrace.js';
import type { ExecutionSummary } from '../trace/ExecutionSummary.js';
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

/**
 * Main runbook execution engine.
 * Orchestrates step execution, flow control, case matching, and actions.
 *
 * v5 features:
 * - Anti-loop protection with maxIterations
 * - continueOnFailure support for resilient steps
 * - Sub-pipeline execution for inline branching
 * - Detailed execution tracing
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
   * @returns Complete execution result with trace
   * @throws RunbookMaxIterationsError if iteration limit is exceeded
   */
  async execute(
    runbook: Runbook,
    params: ReadonlyMap<string, string>,
    services: ServiceRegistry,
  ): Promise<RunbookExecutionResult> {
    const startTime = Date.now();
    const context = createInitialContext(params, services);
    const maxIterations = runbook.maxIterations ?? DEFAULT_MAX_ITERATIONS;

    this.logger.info(`Starting runbook: ${runbook.metadata.name} (${runbook.metadata.id})`);

    let traceBuilder = TraceBuilder.create();
    let finalContext: RunbookContext;
    let status: 'completed' | 'failed' | 'stopped' = 'completed';

    try {
      const { context: resultContext, traceBuilder: stepTraceBuilder } = await this.executeSteps(
        runbook.steps,
        context,
        maxIterations,
        runbook.metadata.id,
        traceBuilder,
      );
      finalContext = resultContext;
      traceBuilder = stepTraceBuilder;
    } catch (error: unknown) {
      if (error instanceof RunbookMaxIterationsError) {
        throw error;
      }
      status = 'failed';
      finalContext = context;
      this.logger.error(`Runbook execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Match known cases
    const { matchedCase, traceBuilder: caseTraceBuilder } = this.matchKnownCases(
      runbook.knownCases,
      finalContext,
      traceBuilder,
    );
    traceBuilder = caseTraceBuilder;

    // Execute action
    const action = matchedCase?.action ?? runbook.fallbackAction;
    const actionTrace = await this.actionExecutor.execute(action, finalContext);
    traceBuilder = traceBuilder.withAction(actionTrace);

    const durationMs = Date.now() - startTime;
    const endedAt = new Date();

    // Build execution info
    traceBuilder = traceBuilder.withExecution({
      executionId: finalContext.executionId,
      runbookId: runbook.metadata.id,
      runbookVersion: runbook.metadata.version,
      startedAt: finalContext.startedAt,
      endedAt,
      durationMs,
      stepsExecuted: finalContext.stepResults.size,
      maxIterations,
    });

    // Build summary
    const varsRecord: Record<string, string> = {};
    for (const [key, value] of finalContext.vars) {
      varsRecord[key] = value;
    }

    const summary: ExecutionSummary = {
      status,
      totalSteps: finalContext.stepResults.size,
      successfulSteps: finalContext.stepResults.size - finalContext.recoveredErrors.length,
      failedSteps: finalContext.recoveredErrors.length,
      skippedSteps: finalContext.recoveredErrors.filter((e) => e.skipped).length,
      caseMatched: matchedCase !== undefined,
      ...(matchedCase !== undefined ? { matchedCaseId: matchedCase.id } : {}),
      durationMs,
      finalVars: varsRecord,
    };

    const trace = traceBuilder.build(summary);

    this.logger.info(
      `Runbook completed: ${runbook.metadata.id} in ${durationMs}ms ` +
        `(${finalContext.stepResults.size} steps, case: ${matchedCase?.id ?? 'none'})`,
    );

    return {
      runbookId: runbook.metadata.id,
      status,
      ...(matchedCase !== undefined ? { matchedCase } : {}),
      durationMs,
      stepsExecuted: finalContext.stepResults.size,
      finalContext,
      recoveredErrors: finalContext.recoveredErrors,
      trace,
    };
  }

  /**
   * Executes steps in sequence respecting FlowDirectives.
   * Includes anti-loop protection (v5) and continueOnFailure support (v5).
   */
  private async executeSteps(
    stepDescriptors: ReadonlyArray<StepDescriptor>,
    initialContext: RunbookContext,
    maxIterations: number,
    runbookId: string,
    initialTraceBuilder: TraceBuilder,
  ): Promise<{ context: RunbookContext; traceBuilder: TraceBuilder }> {
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
    const visitedSequence: string[] = [];

    while (currentIndex < stepDescriptors.length) {
      // Anti-loop protection (v5)
      iterations++;
      if (iterations > maxIterations) {
        const lastStepId = visitedSequence[visitedSequence.length - 1] ?? 'unknown';
        throw new RunbookMaxIterationsError(runbookId, maxIterations, lastStepId, visitedSequence);
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

      this.logger.info(`[${step.id}] ${step.label}`);

      const stepStartTime = Date.now();
      let result: StepResult<unknown>;
      let skipped = false;

      try {
        result = await step.execute(context);
      } catch (error: unknown) {
        // continueOnFailure support (v5)
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
          skipped = true;
        } else {
          throw error;
        }
      }

      const stepDurationMs = Date.now() - stepStartTime;

      // Add step trace
      const stepTrace: StepTrace = {
        stepId: step.id,
        label: step.label,
        kind: step.kind,
        startedAt: new Date(stepStartTime),
        endedAt: new Date(),
        durationMs: stepDurationMs,
        success: result.success,
        ...(result.error !== undefined ? { error: result.error } : {}),
        continueOnFailure: continueOnFailure === true,
        skipped,
      };
      traceBuilder = traceBuilder.addStepTrace(stepTrace);

      // Update context (immutable)
      context = updateContextWithStepResult(context, step.id, result);

      // If step failed with continueOnFailure, proceed to next
      if (result.success === false && continueOnFailure === true) {
        currentIndex++;
        continue;
      }

      // Determine next step
      const directive = result.next ?? 'continue';

      if (directive === 'stop') {
        break;
      } else if (directive === 'continue') {
        currentIndex++;
      } else {
        // goTo
        const targetIndex = stepIndex.get(directive.goTo);
        if (targetIndex === undefined) {
          throw new Error(`Step not found: ${directive.goTo}`);
        }
        currentIndex = targetIndex;
      }
    }

    return { context, traceBuilder };
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

    for (let cycleLen = minCycleLength; cycleLen <= maxCycleLength; cycleLen++) {
      // Need at least 3 repetitions to confirm
      const requiredLength = cycleLen * 3;
      if (visitedSequence.length < requiredLength) {
        continue;
      }

      const tail = visitedSequence.slice(-requiredLength);
      let isCycle = true;

      for (let i = 0; i < cycleLen; i++) {
        const first = tail[i];
        const second = tail[i + cycleLen];
        const third = tail[i + cycleLen * 2];
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
   * Evaluates known cases against the final context.
   * Cases are sorted by priority (descending) and the first match wins.
   */
  private matchKnownCases(
    knownCases: ReadonlyArray<KnownCase>,
    context: RunbookContext,
    initialTraceBuilder: TraceBuilder,
  ): { matchedCase: KnownCase | undefined; traceBuilder: TraceBuilder } {
    let traceBuilder = initialTraceBuilder;
    const sorted = [...knownCases].sort((a, b) => b.priority - a.priority);

    for (const knownCase of sorted) {
      const caseStartTime = Date.now();
      const matched = this.conditionEvaluator.evaluate(knownCase.condition, context);
      const caseDurationMs = Date.now() - caseStartTime;

      const caseTrace: CaseMatchingTrace = {
        caseId: knownCase.id,
        description: knownCase.description,
        priority: knownCase.priority,
        matched,
        durationMs: caseDurationMs,
      };
      traceBuilder = traceBuilder.addCaseMatchingTrace(caseTrace);

      if (matched) {
        this.logger.info(`Known case identified: ${knownCase.description}`);
        return { matchedCase: knownCase, traceBuilder };
      }
    }

    this.logger.warning('No known case matches the result.');
    return { matchedCase: undefined, traceBuilder };
  }
}
