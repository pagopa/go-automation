import type { GOLogger } from '@pagopa/go-common/logging';
import { GORegexCache } from '@pagopa/go-common/utils';
import type { Runbook } from '../types/Runbook.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { RunbookExecutionResult } from '../types/RunbookExecutionResult.js';
import type { StepDescriptor } from '../types/StepDescriptor.js';
import type { StepResult } from '../types/StepResult.js';
import type { KnownCase } from '../types/KnownCase.js';
import type { CaseAction } from '../types/CaseAction.js';
import type { KnownCaseDetection } from '../types/KnownCaseDetection.js';
import type { CoverageEntry } from '../types/CoverageEntry.js';
import type { IdentifierObservation } from '../types/IdentifierObservation.js';
import type { ObservedErrors } from '../types/ObservedErrors.js';
import type { ErrorRecoveryInfo } from '../types/ErrorRecoveryInfo.js';
import type { FlowDirective, FlowDirectiveString } from '../types/FlowDirective.js';
import type { RunbookExecutionStatus } from '../types/RunbookExecutionStatus.js';
import type { WorkflowServices } from '../types/WorkflowServices.js';
import type { RunbookEngineOptions } from '../types/RunbookEngineOptions.js';
import { assertRequiredServices } from './assertRequiredServices.js';
import type { ExecutionEnvironment } from '../tracing/ExecutionEnvironment.js';
import { sharedConditionEvaluator } from './ConditionEvaluator.js';
import { resolveRef } from '../context/resolveRef.js';
import { buildStepIndex } from './buildStepIndex.js';
import { detectRuntimeCycle } from './detectRuntimeCycle.js';
import { ActionExecutor, type ActionExecutionResult } from '../actions/ActionExecutor.js';
import { TraceBuilder } from '../tracing/TraceBuilder.js';
import { throwIfRunbookAborted } from '../context/throwIfRunbookAborted.js';
import type { EvidenceIndices } from './EvidenceIndices.js';
import { RunbookMaxIterationsError } from '../errors/RunbookMaxIterationsError.js';
import type { DescendRequest } from '../types/DescendRequest.js';
import type { ErrorTreeRun } from '../types/ErrorTreeRun.js';
import type { TreeChainGroup } from '../types/TreeChainGroup.js';
import type { TreeLevelReader } from '../types/TreeLevelReader.js';
import type { TreeLevelReadResult } from '../types/TreeLevelReadResult.js';
import type { TreeReadIdentifier } from '../types/TreeReadIdentifier.js';
import type { TreeStepsRun } from '../types/TreeStepsRun.js';
import { ErrorTreeExecutor } from '../tree/ErrorTreeExecutor.js';
import { buildTreeChains } from '../tree/buildTreeChains.js';
import { computeCaseLevels } from '../tree/computeCaseLevels.js';
import {
  createInitialContext,
  updateContextWithStepResult,
  addRecoveredError,
} from '../context/RunbookContextHelper.js';

/** Default maximum iterations for anti-loop protection */
const DEFAULT_MAX_ITERATIONS = 1000;

/** Longest coverage detail the engine records for a failed read. */
const MAX_COVERAGE_DETAIL = 200;

/** Default execution environment when none is provided */
const DEFAULT_ENVIRONMENT: ExecutionEnvironment = {
  invokedBy: 'manual',
};

type ReachedVia = 'sequential' | 'goTo' | 'subPipeline';
type StepTraceStatus = 'success' | 'failed' | 'skipped';

interface StepExecutionOutcome {
  readonly context: RunbookContext;
  readonly result: StepResult<unknown>;
}

/** Per-execution state of {@link RunbookEngine.executeSteps}: created by each `execute`, never shared. */
interface ExecutionState {
  /** Every output of every visit of a step, in order: the evidence of repeated visits. */
  readonly visits: Map<string, unknown[]>;
  /** Partial evidence declared by the steps or recorded for a failed read. */
  readonly coverage: CoverageEntry[];
  /** Errors observed and examined, as last declared by a step. */
  observedErrors?: ObservedErrors;
  /** Whether a read (`data` step) has already succeeded: a later failure leaves partial evidence. */
  evidenceCollected: boolean;
  /** Descents requested by the steps of an error-tree node. */
  readonly descends: DescendRequest[];
  /** Errors of the steps that failed, recovered ones included. */
  readonly failures: string[];
}

interface StepsOutcome {
  readonly context: RunbookContext;
  readonly aborted: boolean;
  readonly failureReason?: string;
}

/** A matching case with its evidence, before the replaced cases are removed and the detections ordered. */
interface CaseMatch {
  readonly knownCase: KnownCase;
  readonly declarationIndex: number;
  readonly firstMs?: number;
  readonly lastMs?: number;
  readonly evidenceRows: number;
  readonly observations: ReadonlyArray<IdentifierObservation>;
  readonly resolvedValues: Readonly<Record<string, unknown>>;
  /** Indices of the evidence elements of each array ref. */
  readonly evidence: ReadonlyMap<string, ReadonlySet<number>>;
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
 * - Every matching known case reported as a detection, ordered by the time of its evidence
 * - Partial evidence (coverage) declared by the steps, and kept when a later step fails
 *
 * @example
 * ```typescript
 * const engine = new RunbookEngine(logger);
 * const result = await engine.execute(runbook, params, services);
 * ```
 */
export class RunbookEngine {
  private readonly actionExecutor: ActionExecutor;
  /** Compiled regexes of this engine, shared by the contexts it runs (R9). */
  private readonly regexCache = new GORegexCache();

  /**
   * @param logger - Logger of the execution narrative
   * @param options - Injected collaborators (service capability predicates, log action renderer, evidence time reader)
   */
  constructor(
    private readonly logger: GOLogger,
    private readonly options: RunbookEngineOptions = {},
  ) {
    this.actionExecutor = new ActionExecutor(logger, options.logActionRenderer);
  }

  /**
   * Executes a complete runbook.
   *
   * Flow:
   * 1. Initialize context with input parameters
   * 2. Execute steps in sequence (respecting FlowDirectives)
   * 3. Evaluate every known case, in declaration order
   * 4. Execute the action of every detection, in the order of the detections (or the fallback)
   * 5. Build and return execution result with trace
   *
   * A step that fails after some evidence has been collected does not fail the execution: the pipeline stops, the
   * failed read becomes an `unavailable` coverage entry and the known cases are evaluated on the context reached.
   *
   * @param runbook - Runbook definition to execute
   * @param params - Input parameters (alarmName, timeRange, etc.)
   * @param services - Services of the execution; every service a step requires must be usable
   * @param environment - Execution environment info (optional)
   * @param signal - Optional abort signal to cancel the execution
   * @returns Complete execution result with trace
   * @throws RunbookMissingServicesError before the first step, if a required service is unusable
   * @throws RunbookMaxIterationsError if iteration limit is exceeded
   */
  async execute<TServices extends WorkflowServices>(
    runbook: Runbook,
    params: ReadonlyMap<string, string>,
    services: TServices,
    environment?: ExecutionEnvironment,
    signal?: AbortSignal,
  ): Promise<RunbookExecutionResult> {
    assertRequiredServices(runbook, services, this.options.serviceCapabilities);
    const context: RunbookContext = {
      ...createInitialContext(params, services, signal, this.regexCache),
      // Only an alarm analysis keeps partial evidence; a procedure reads strictly, as every required step needs.
      readPolicy: runbook.metadata.type === 'alarm-resolution' ? 'partial' : 'strict',
      sharedReads: new Map(),
    };
    const maxIterations = runbook.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const env = environment ?? DEFAULT_ENVIRONMENT;
    const state: ExecutionState = {
      visits: new Map(),
      coverage: [],
      evidenceCollected: false,
      descends: [],
      failures: [],
    };

    this.logger.info(`Starting runbook: ${runbook.metadata.name} (${runbook.metadata.id})`);

    const traceBuilder = new TraceBuilder(context.executionId, runbook, params);
    let finalContext: RunbookContext;
    let status: RunbookExecutionStatus = 'completed';
    let failureReason: string | undefined;

    try {
      const stepsResult = await this.executeSteps(
        runbook.steps,
        context,
        maxIterations,
        runbook.metadata.id,
        traceBuilder,
        state,
        // Only an alarm analysis keeps partial evidence: a procedure needs every required step.
        runbook.metadata.type === 'alarm-resolution',
      );
      finalContext = stepsResult.context;
      if (stepsResult.aborted) {
        status = 'aborted';
        failureReason = 'Execution aborted by signal';
      } else if (stepsResult.failureReason !== undefined) {
        status = 'failed';
        failureReason = stepsResult.failureReason;
        this.logger.error(`Runbook execution failed: ${failureReason}`);
      }
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
    } finally {
      // The reporter holds the last node back until it knows whether a sibling
      // follows; nothing else will report, so close the level here. Runs on the
      // rethrown max-iterations path too.
      //
      // Best effort on purpose: a logger handler can throw (a broken pipe when
      // the output is piped into `head`, a full disk on the file handler) and
      // `GOLogger` does not contain handler errors. Letting that escape a
      // `finally` would replace the runbook's real outcome with a logging
      // failure.
      try {
        services.reporter.flush();
      } catch {
        // The narrative is already truncated; the execution result is what matters.
      }
    }

    if (status === 'completed' && finalContext.signal?.aborted === true) {
      status = 'aborted';
      failureReason = 'Execution aborted by signal';
    }

    let detections: ReadonlyArray<KnownCaseDetection> = [];
    let treeRun: ErrorTreeRun | undefined;
    let chains: ReadonlyArray<TreeChainGroup> | undefined;
    if (status === 'completed') {
      // A gap scoped to some identifiers is carried by their nodes, not by every chain.
      const windowIncomplete = state.coverage.some((entry) => entry.scoped !== true);
      try {
        if (runbook.tree === undefined) {
          detections = this.detectKnownCases(
            runbook.knownCases,
            evidenceContext(finalContext, state.visits),
            traceBuilder,
          );
        } else {
          treeRun = await this.investigateTree(runbook, evidenceContext(finalContext, state.visits), {
            maxIterations,
            traceBuilder,
            state,
          });
          detections = orderedTreeDetections(treeRun);
          chains = buildTreeChains(treeRun.nodes, windowIncomplete, caseOrderOf(runbook.knownCases));
          traceBuilder.traceDetections([...new Set(detections.map((detection) => detection.knownCase.id))]);
          this.logTreeDetections(treeRun);
        }
      } catch (error: unknown) {
        // An abort while the tree is investigated or the cases are evaluated ends the run aborted, with the trace
        // collected so far.
        if (!isAborted(finalContext)) throw error;
      }
      // An abort during the evaluation, thrown or not, ends the run aborted, with the trace collected so far.
      if (isAborted(finalContext)) {
        status = 'aborted';
        failureReason = 'Execution aborted by signal';
        detections = [];
      }
    }

    // Every detection runs its action, in the order of the detections; in an error tree, once per group of chains,
    // from the node that recognized the case. The fallback runs only when nothing matched.
    if (status === 'completed') {
      const actions =
        detections.length === 0
          ? [{ action: runbook.fallbackAction, context: fallbackContext(finalContext, treeRun, chains) }]
          : treeRun !== undefined && chains !== undefined
            ? treeActions(treeRun, chains)
            : detections.map((d) => ({ action: d.knownCase.action, context: finalContext }));
      for (const { action, context: actionContext } of actions) {
        // An abort during an action stops the dispatch: the run ends aborted, with the trace collected so far.
        if (isAborted(finalContext)) break;
        let actionResult: ActionExecutionResult;
        try {
          actionResult = await this.actionExecutor.execute(action, actionContext);
        } catch (error: unknown) {
          if (isAborted(finalContext)) break;
          throw error;
        }
        traceBuilder.traceAction(
          actionResult.action,
          actionResult.actionType,
          actionResult.status,
          actionResult.durationMs,
          actionResult.resolvedMessage,
          actionResult.error,
        );
      }
    }

    if (status === 'completed' && isAborted(finalContext)) {
      status = 'aborted';
      failureReason = 'Execution aborted by signal';
      detections = [];
    }

    traceBuilder.traceCoverage(state.coverage);
    const trace = traceBuilder.build(finalContext, status, env, failureReason);

    const caseTag = detections.length === 0 ? 'none' : detections.map((d) => d.knownCase.id).join(', ');
    this.logger.info(
      `Runbook ${status}: ${runbook.metadata.id} in ${trace.execution.durationMs}ms ` +
        `(${finalContext.stepResults.size} steps, cases: ${caseTag})`,
    );

    return {
      runbookId: runbook.metadata.id,
      status,
      detections,
      coverage: state.coverage,
      ...(treeRun?.observedErrors !== undefined
        ? { observedErrors: treeRun.observedErrors }
        : state.observedErrors !== undefined
          ? { observedErrors: state.observedErrors }
          : {}),
      ...(treeRun !== undefined && status === 'completed'
        ? { tree: treeRun.nodes, nodeContexts: treeRun.contexts, chains: chains ?? [] }
        : {}),
      durationMs: trace.execution.durationMs,
      stepsExecuted: trace.summary.stepsExecuted,
      finalContext,
      recoveredErrors: finalContext.recoveredErrors,
      trace,
    };
  }

  /**
   * Executes steps in sequence respecting FlowDirectives.
   * Includes anti-loop protection and continueOnFailure support.
   *
   * A failing step ends the pipeline. When some evidence was already collected it is a partial read: the step becomes
   * an `unavailable` coverage entry and the execution stays completed. Otherwise the execution fails.
   */
  private async executeSteps(
    stepDescriptors: ReadonlyArray<StepDescriptor>,
    initialContext: RunbookContext,
    maxIterations: number,
    runbookId: string,
    traceBuilder: TraceBuilder,
    state: ExecutionState,
    partialOnFailure: boolean,
  ): Promise<StepsOutcome> {
    let context = initialContext;

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

      const evidenceBefore = state.evidenceCollected;
      const execution = await this.executeStepDescriptor(descriptor, context, reachedVia, traceBuilder);
      context = execution.context;
      const result = execution.result;
      recordStepEvidence(state, step.id, result);
      if (result.success && step.kind === 'data') state.evidenceCollected = true;
      if (!result.success) {
        state.coverage.push(failedReadCoverage(step.id, result.error));
        state.failures.push(result.error ?? `Step "${step.id}" failed`);
      }
      context = { ...context, coverage: [...state.coverage] };
      const directive = result.next ?? 'continue';

      if (!result.success) {
        // If step failed with continueOnFailure, proceed to next
        if (continueOnFailure === true) {
          reachedVia = 'sequential';
          currentIndex++;
          continue;
        }
        if (evidenceBefore && partialOnFailure) {
          this.logger.warning(`[${step.id}] Step failed after evidence was collected: the evidence is partial`);
          return { context, aborted: false };
        }
        return {
          context,
          aborted: false,
          failureReason: result.error ?? `Step "${step.id}" failed without an error message.`,
        };
      }

      // Determine next step
      if (directive === 'stop') {
        break;
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

    return { context, aborted };
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
    let traceInfo: Readonly<Record<string, unknown>> | undefined;
    try {
      traceInfo = step.getTraceInfo?.(context);
    } catch {
      // Trace metadata describes the step: failing to build it never fails the step.
      traceInfo = undefined;
    }
    const stepInput = traceInfo !== undefined ? { ...baseInput, resolvedConfig: traceInfo } : baseInput;

    try {
      result = await step.execute(context);
    } catch (error: unknown) {
      // An abort stays an abort; any other throw becomes a failed result, so that the pipeline decides whether the
      // evidence already collected makes it a partial read.
      if (context.signal?.aborted === true) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (continueOnFailure === true) {
        this.logger.warning(`[${step.id}] Step failed but continueOnFailure=true: ${errorMessage}`);
        const recoveryInfo: ErrorRecoveryInfo = {
          stepId: step.id,
          originalError: errorMessage,
          failedAt: new Date(),
          skipped: true,
        };
        result = { success: false, error: errorMessage, errorRecovery: recoveryInfo };
        updatedContext = addRecoveredError(context, recoveryInfo);
        recovered = true;
      } else {
        result = { success: false, error: errorMessage };
      }
      stepStatus = 'failed';
    }

    const stepCompletedAt = new Date().toISOString();
    const stepDurationMs = Date.now() - stepStartTime;

    if (!result.success && !recovered) {
      stepStatus = 'failed';
    }

    const directive = result.next ?? 'continue';
    const varsWritten: Readonly<Record<string, string>> = result.vars ?? {};
    traceBuilder.traceStep(
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
      result.diagnostics,
      result.error,
    );

    return {
      context: updateContextWithStepResult(updatedContext, step.id, result),
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
    if (directive === 'continue' || directive === 'stop') {
      return directive;
    }
    return directive.goTo;
  }

  /**
   * Evaluates every known case against the final context and returns the detections.
   *
   * Cases are evaluated in declaration order and every match is kept. A case listed in the `supersedes` of another
   * matching case leaves the detections and stays in the trace with `supersededBy`. The detections are ordered by the
   * time of their evidence: `firstSeenAt` ascending, declaration order on ties, untimed detections last.
   *
   * @param knownCases - Known cases of the runbook
   * @param context - Final context, with the evidence of repeated visits
   * @param traceBuilder - Trace of the execution
   * @param nodeId - Error-tree node the cases are evaluated on
   * @returns The detections, in their order
   */
  private detectKnownCases(
    knownCases: ReadonlyArray<KnownCase>,
    context: RunbookContext,
    traceBuilder: TraceBuilder,
    nodeId?: string,
  ): ReadonlyArray<KnownCaseDetection> {
    const matches = new Map<string, CaseMatch>();
    const evaluations: { knownCase: KnownCase; resolvedValues: Readonly<Record<string, unknown>> }[] = [];

    for (const [declarationIndex, knownCase] of knownCases.entries()) {
      throwIfRunbookAborted(context);
      const { matched, resolvedValues, evidence } = sharedConditionEvaluator.evaluate(knownCase.condition, context, {
        withResolvedValues: true,
      });
      evaluations.push({ knownCase, resolvedValues });
      if (matched) {
        matches.set(knownCase.id, {
          knownCase,
          declarationIndex,
          resolvedValues,
          evidence,
          ...this.readEvidence(evidence, context),
        });
      }
    }

    // Every superseding case contributes the rows it covers; the replaced case is then evaluated once without all
    // of them. A superseding case without row evidence (variables only) replaces it whole.
    const covering = new Map<string, { readonly by: string; whole: boolean; readonly rows: EvidenceIndices }>();
    for (const match of matches.values()) {
      for (const replacedId of match.knownCase.supersedes ?? []) {
        if (!matches.has(replacedId)) continue;
        const entry = covering.get(replacedId) ?? {
          by: match.knownCase.id,
          whole: false,
          rows: new Map<string, Set<number>>(),
        };
        if (countEvidence(match.evidence) === 0) entry.whole = true;
        for (const [ref, indices] of match.evidence) {
          // `steps.<id>` and `steps.<id>.output` are the same array: unite their indices once.
          const key = canonicalRef(ref);
          const union = entry.rows.get(key) ?? new Set<number>();
          for (const index of indices) union.add(index);
          entry.rows.set(key, union);
        }
        covering.set(replacedId, entry);
      }
    }
    const supersededBy = new Map<string, string>();
    for (const [replacedId, entry] of covering) {
      const replaced = matches.get(replacedId);
      if (replaced === undefined) continue;
      const residual = entry.whole ? undefined : withoutEvidence(context, entry.rows);
      const again =
        residual === undefined
          ? undefined
          : sharedConditionEvaluator.evaluate(replaced.knownCase.condition, residual, { withResolvedValues: true });
      if (residual === undefined || again?.matched !== true || countEvidence(again.evidence) === 0) {
        supersededBy.set(replacedId, entry.by);
      } else {
        matches.set(replacedId, {
          ...replaced,
          evidence: again.evidence,
          ...this.readEvidence(again.evidence, residual),
        });
      }
    }

    for (const { knownCase, resolvedValues } of evaluations) {
      const match = matches.get(knownCase.id);
      const replacedBy = supersededBy.get(knownCase.id);
      traceBuilder.traceCaseEvaluation(knownCase, match !== undefined, resolvedValues, {
        ...(match?.firstMs !== undefined ? { firstSeenAt: new Date(match.firstMs).toISOString() } : {}),
        ...(match?.lastMs !== undefined ? { lastSeenAt: new Date(match.lastMs).toISOString() } : {}),
        ...(match !== undefined ? { evidenceRows: match.evidenceRows } : {}),
        ...(replacedBy !== undefined ? { supersededBy: replacedBy } : {}),
        ...(nodeId !== undefined ? { nodeId } : {}),
      });
    }

    const ordered = [...matches.values()]
      .filter((match) => !supersededBy.has(match.knownCase.id))
      .sort(compareCaseMatches);
    const detections = ordered.map((match): KnownCaseDetection => ({
      knownCase: match.knownCase,
      ...(match.firstMs !== undefined ? { firstSeenAt: new Date(match.firstMs).toISOString() } : {}),
      ...(match.lastMs !== undefined ? { lastSeenAt: new Date(match.lastMs).toISOString() } : {}),
      evidenceRows: match.evidenceRows,
      observations: match.observations,
    }));
    // The detections of an error tree are traced and narrated once, for the whole tree.
    if (nodeId !== undefined) return detections;
    traceBuilder.traceDetections(detections.map((detection) => detection.knownCase.id));

    if (detections.length > 0) {
      const description =
        detections.length === 1
          ? `Known case identified: ${detections[0]?.knownCase.description ?? ''}`
          : `Known cases identified (${String(detections.length)}): ${detections.map((d) => d.knownCase.description).join(' | ')}`;
      this.logger.success(description);
    }
    return detections;
  }

  /**
   * Investigates the error tree of the runbook from the context of the window, level by level.
   *
   * @param runbook - Runbook with its levels
   * @param window - Context reached by the steps of the window, with the evidence of repeated visits
   * @param execution - Iteration cap, trace and state of the execution
   * @returns The investigated tree
   */
  private async investigateTree(
    runbook: Runbook,
    window: RunbookContext,
    execution: { readonly maxIterations: number; readonly traceBuilder: TraceBuilder; readonly state: ExecutionState },
  ): Promise<ErrorTreeRun> {
    const tree = runbook.tree;
    if (tree === undefined) throw new Error(`Runbook "${runbook.metadata.id}" has no error tree.`);
    const { maxIterations, traceBuilder, state } = execution;
    const skipped = new Set<string>();
    const executor = new ErrorTreeExecutor(tree, computeCaseLevels(runbook.knownCases, tree), runbook.knownCases, {
      runSteps: async (steps, context) =>
        this.runNodeSteps(steps, context, { maxIterations, runbookId: runbook.metadata.id, traceBuilder, state }),
      recordRead: (read, identifiers, result, startedAtMs) => {
        recordTreeRead(state, traceBuilder, read, identifiers, result, startedAtMs);
      },
      evaluateCases: (knownCases, context, nodeId) => this.detectKnownCases(knownCases, context, traceBuilder, nodeId),
      recordSkipped: (target, readStepId) => {
        if (skipped.has(target)) return;
        skipped.add(target);
        state.coverage.push({
          stepId: readStepId ?? target,
          source: target,
          complete: false,
          reason: 'skipped',
          detail: 'identificatore mancante per la discesa',
        });
      },
    });
    return executor.run(window);
  }

  /**
   * Runs the steps of an error node in its own context: what they write stays in the node, and the coverage they
   * declare joins the execution.
   *
   * @param steps - Steps of the level
   * @param context - Context of the node
   * @param execution - Iteration cap, runbook id, trace and state of the execution
   * @returns The context reached, the failure if a step failed, and the descents the steps requested
   * @throws DOMException `AbortError` when the execution is aborted
   */
  private async runNodeSteps(
    steps: ReadonlyArray<StepDescriptor>,
    context: RunbookContext,
    execution: {
      readonly maxIterations: number;
      readonly runbookId: string;
      readonly traceBuilder: TraceBuilder;
      readonly state: ExecutionState;
    },
  ): Promise<TreeStepsRun> {
    const inherited = context.coverage ?? [];
    const nodeState: ExecutionState = {
      visits: new Map(),
      coverage: [...inherited],
      evidenceCollected: true,
      descends: [],
      failures: [],
    };
    const outcome = await this.executeSteps(
      steps,
      context,
      execution.maxIterations,
      execution.runbookId,
      execution.traceBuilder,
      nodeState,
      false,
    );
    const added = nodeState.coverage.slice(inherited.length);
    // A read shared by several nodes declares its coverage in each node, and once in the execution.
    const declared = new Set(execution.state.coverage.map((entry) => JSON.stringify(entry)));
    execution.state.coverage.push(...added.filter((entry) => !declared.has(JSON.stringify(entry))));
    if (outcome.aborted) throwIfRunbookAborted(outcome.context);
    return {
      ...(added.length > 0 ? { incompleteEvidence: true } : {}),
      context: evidenceContext(outcome.context, nodeState.visits),
      // A step that failed, even one allowed to fail, leaves the analysis of the node incomplete.
      ...((outcome.failureReason ?? nodeState.failures[0]) !== undefined
        ? { failure: outcome.failureReason ?? nodeState.failures[0] ?? '' }
        : {}),
      descends: nodeState.descends,
    };
  }

  /**
   * Narrates the cases recognized in the error tree, once.
   *
   * @param run - Investigated tree
   */
  private logTreeDetections(run: ErrorTreeRun): void {
    const recognized = run.nodes.filter((node) => node.detections.length > 0);
    if (recognized.length === 0) return;
    const caseIds = [...new Set(recognized.flatMap((node) => node.detections.map((d) => d.knownCase.id)))];
    this.logger.success(
      `Known cases identified on ${String(recognized.length)} of ${String(run.nodes.length)} error nodes: ${caseIds.join(', ')}`,
    );
  }

  /**
   * Reads time, weight and identifiers of the evidence of a match.
   *
   * Complexity: O(E) over the evidence elements.
   *
   * @param evidence - Indices of the matching elements of each array ref
   * @param context - Context the condition was evaluated on
   * @returns The time bounds, the evidence rows and the identifier observations
   */
  private readEvidence(
    evidence: ReadonlyMap<string, ReadonlySet<number>>,
    context: RunbookContext,
  ): Pick<CaseMatch, 'firstMs' | 'lastMs' | 'evidenceRows' | 'observations'> {
    const reader = this.options.evidenceTime;
    let firstMs: number | undefined;
    let lastMs: number | undefined;
    let evidenceRows = 0;
    const observations = new Map<string, IdentifierObservation & { readonly ms?: number }>();

    for (const [ref, indices] of evidence) {
      const elements = resolveRef(ref, context);
      if (!Array.isArray(elements)) continue;
      for (const index of indices) {
        const element: unknown = elements[index];
        const time = reader?.(element);
        if (time === undefined) {
          evidenceRows += 1;
          continue;
        }
        evidenceRows += time.weight;
        if (time.first !== undefined) firstMs = firstMs === undefined ? time.first : Math.min(firstMs, time.first);
        if (time.last !== undefined) lastMs = lastMs === undefined ? time.last : Math.max(lastMs, time.last);
        for (const identifier of time.identifiers ?? []) {
          // Each identifier is observed at the instant of its own row; the earliest observation wins, and an
          // identifier without time is kept untimed until a timed observation arrives.
          const at = identifier.at;
          const key = `${identifier.kind}:${identifier.value}`;
          const previous = observations.get(key);
          if (previous !== undefined && (at === undefined || (previous.ms !== undefined && previous.ms <= at)))
            continue;
          observations.set(key, {
            kind: identifier.kind,
            value: identifier.value,
            ...(at === undefined ? {} : { observedAt: new Date(at).toISOString(), ms: at }),
          });
        }
      }
    }

    return {
      ...(firstMs !== undefined ? { firstMs } : {}),
      ...(lastMs !== undefined ? { lastMs } : {}),
      evidenceRows,
      observations: [...observations.values()]
        .sort((a, b) => (a.ms ?? Number.POSITIVE_INFINITY) - (b.ms ?? Number.POSITIVE_INFINITY))
        .map(({ kind, value, observedAt }) => ({ kind, value, ...(observedAt !== undefined ? { observedAt } : {}) })),
    };
  }
}

/**
 * The context without the evidence elements a superseding case covers, by canonical ref: each covered array keeps
 * only the other elements. Refs into nested arrays (`steps.<id>.<field>`) are rebuilt; indexed paths are left as they are.
 *
 * @param context - Context the cases were evaluated on
 * @param covered - Evidence of the superseding case
 * @returns A copy of the context with the covered elements removed
 */
function withoutEvidence(context: RunbookContext, covered: ReadonlyMap<string, ReadonlySet<number>>): RunbookContext {
  const stepResults = new Map(context.stepResults);
  for (const [ref, indices] of covered) {
    // The refs are canonical (`canonicalRef`): the path after the step id is the property path, `output` included
    // when it is a real property of the step output.
    const [source, stepId, ...path] = ref.split('.');
    if (source !== 'steps' || stepId === undefined || ref.includes('[')) continue;
    stepResults.set(stepId, withoutElements(stepResults.get(stepId), path, indices));
  }
  return { ...context, stepResults };
}

/** The ref of an evidence array without the redundant `.output` of a step ref. */
function canonicalRef(ref: string): string {
  const [source, stepId, next, ...rest] = ref.split('.');
  if (source !== 'steps' || stepId === undefined || next !== 'output') return ref;
  return ['steps', stepId, ...rest].join('.');
}

/** A copy of `value` with the array at `path` filtered of the given indices. */
function withoutElements(value: unknown, path: ReadonlyArray<string>, indices: ReadonlySet<number>): unknown {
  const [head, ...tail] = path;
  if (head === undefined) {
    return Array.isArray(value) ? value.filter((_element: unknown, index) => !indices.has(index)) : value;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const record = value as Readonly<Record<string, unknown>>;
  return { ...record, [head]: withoutElements(record[head], tail, indices) };
}

/** Number of evidence elements over every ref. */
function countEvidence(evidence: ReadonlyMap<string, ReadonlySet<number>>): number {
  let count = 0;
  for (const indices of evidence.values()) count += indices.size;
  return count;
}

/**
 * Orders matches by the time of their evidence: earliest first, declaration order on ties, untimed matches last.
 *
 * @returns A negative number when `a` comes first
 */
function compareCaseMatches(a: CaseMatch, b: CaseMatch): number {
  if (a.firstMs !== undefined && b.firstMs !== undefined && a.firstMs !== b.firstMs) return a.firstMs - b.firstMs;
  if (a.firstMs !== undefined && b.firstMs === undefined) return -1;
  if (a.firstMs === undefined && b.firstMs !== undefined) return 1;
  return a.declarationIndex - b.declarationIndex;
}

/**
 * Records what a step result adds to the evidence of the execution: its output, as one more visit, and its coverage.
 *
 * @param state - State of the execution
 * @param stepId - Step that produced the result
 * @param result - Result of the step
 */
function recordStepEvidence(state: ExecutionState, stepId: string, result: StepResult<unknown>): void {
  if (result.output !== undefined) {
    const visits = state.visits.get(stepId) ?? [];
    visits.push(result.output);
    state.visits.set(stepId, visits);
  }
  for (const coverage of result.coverage ?? []) {
    if (coverage.complete) continue;
    const { detail, ...rest } = coverage;
    state.coverage.push({
      stepId,
      ...rest,
      ...(detail !== undefined ? { detail: boundedDetail(detail) } : {}),
    });
  }
  if (result.observedErrors !== undefined) state.observedErrors = result.observedErrors;
  if (result.descend !== undefined) state.descends.push(...result.descend);
}

/**
 * The coverage entry of a failed read.
 *
 * @param stepId - Step that failed
 * @param error - Error message of the failure
 * @returns An `unavailable` coverage entry with a bounded detail
 */
function failedReadCoverage(stepId: string, error: string | undefined): CoverageEntry {
  return {
    stepId,
    complete: false,
    reason: 'unavailable',
    ...(error !== undefined ? { detail: boundedDetail(error) } : {}),
  };
}

/**
 * The context the known cases are evaluated on.
 *
 * A step that ran more than once (for example a service read with a fallback identifier and then with the trace id)
 * contributes the rows of every visit, in order: a row found by the first visit and not by the second stays evidence.
 * Scalar variables keep the last write, as during the pipeline.
 *
 * @param context - Final context of the pipeline
 * @param visits - Every output of every step, in order
 * @returns The context with the concatenated array outputs of repeated visits
 */
function evidenceContext(context: RunbookContext, visits: ReadonlyMap<string, ReadonlyArray<unknown>>): RunbookContext {
  let stepResults: Map<string, unknown> | undefined;
  for (const [stepId, outputs] of visits) {
    if (outputs.length < 2 || !outputs.every((output) => Array.isArray(output))) continue;
    stepResults ??= new Map(context.stepResults);
    stepResults.set(stepId, (outputs as ReadonlyArray<ReadonlyArray<unknown>>).flat());
  }
  return stepResults === undefined ? context : { ...context, stepResults };
}

/**
 * Whether the execution was aborted. A function, so that a check after an `await` reads the signal again.
 *
 * @param context - Context of the execution
 * @returns `true` when the signal is aborted
 */
function isAborted(context: RunbookContext): boolean {
  return context.signal?.aborted === true;
}

/**
 * A coverage detail within its bound, cut at a word boundary: a name cut in half (a profile, an account) would no
 * longer match the whole-token scrub applied where the output leaves the host.
 *
 * @param text - Detail to bound
 * @returns The text, or its longest prefix of whole words within the bound
 */
function boundedDetail(text: string): string {
  if (text.length <= MAX_COVERAGE_DETAIL) return text;
  const cut = text.slice(0, MAX_COVERAGE_DETAIL);
  const boundary = cut.search(/\s\S*$/u);
  return boundary > 0 ? cut.slice(0, boundary) : '';
}

/**
 * Records a grouped read of an error-tree level: a step in the trace, and its coverage in the execution.
 *
 * @param state - State of the execution
 * @param traceBuilder - Trace of the execution
 * @param read - Read of the level
 * @param identifiers - Identifiers of the batch
 * @param result - Result of the read
 * @param startedAtMs - Start of the read
 */
function recordTreeRead(
  state: ExecutionState,
  traceBuilder: TraceBuilder,
  read: TreeLevelReader,
  identifiers: ReadonlyArray<TreeReadIdentifier>,
  result: TreeLevelReadResult,
  startedAtMs: number,
): void {
  const completedAtMs = Date.now();
  traceBuilder.traceStep(
    read.id,
    read.label,
    read.kind,
    'subPipeline',
    new Date(startedAtMs).toISOString(),
    new Date(completedAtMs).toISOString(),
    completedAtMs - startedAtMs,
    result.success ? 'success' : 'failed',
    false,
    { identifiers: identifiers.map((identifier) => `${identifier.kind}=${identifier.value}`) },
    result.rows,
    {},
    'continue',
    result.diagnostics,
    result.error,
  );
  // The coverage of a batch applies to every identifier of the batch.
  const scope = `${String(identifiers.length)} identificatori`;
  if (!result.success) {
    state.coverage.push(failedReadCoverage(read.id, `${scope}: ${result.error ?? 'lettura fallita'}`));
    return;
  }
  for (const coverage of result.coverage ?? []) {
    if (coverage.complete) continue;
    const { detail, ...rest } = coverage;
    state.coverage.push({
      stepId: read.id,
      ...rest,
      detail: boundedDetail(detail === undefined ? scope : `${scope}: ${detail}`),
    });
  }
}

/**
 * The detections of every node of an error tree, ordered by `firstSeenAt` (untimed last), nodes in tree order on ties.
 *
 * @param run - Investigated tree
 * @returns The detections
 */
function orderedTreeDetections(run: ErrorTreeRun): ReadonlyArray<KnownCaseDetection> {
  const all = run.nodes.flatMap((node) => node.detections);
  return all
    .map((detection, index) => ({ detection, index, ms: timeOf(detection.firstSeenAt) }))
    .sort((a, b) => {
      if (a.ms !== undefined && b.ms !== undefined && a.ms !== b.ms) return a.ms - b.ms;
      if (a.ms !== undefined && b.ms === undefined) return -1;
      if (a.ms === undefined && b.ms !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ detection }) => detection);
}

/** Milliseconds of an ISO time, or nothing. */
function timeOf(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}

/** Declaration index of every case. */
function caseOrderOf(knownCases: ReadonlyArray<KnownCase>): ReadonlyMap<string, number> {
  return new Map(knownCases.map((knownCase, index) => [knownCase.id, index]));
}

/**
 * The actions of an error tree: the action of every recognized case runs once per group of chains, in the order of
 * the groups, from the node that recognized it in the oldest member, with the context of that node. A node shared
 * by two groups runs its actions for each.
 *
 * @param run - Investigated tree
 * @param chains - Groups of chains, in time order
 * @returns The actions with their contexts, in order
 */
function treeActions(
  run: ErrorTreeRun,
  chains: ReadonlyArray<TreeChainGroup>,
): ReadonlyArray<{ readonly action: CaseAction; readonly context: RunbookContext }> {
  const byId = new Map(run.nodes.map((node) => [node.id, node]));
  const actions: { readonly action: CaseAction; readonly context: RunbookContext }[] = [];
  for (const group of chains) {
    const done = new Set<string>();
    const oldest = group.members[0];
    for (const nodeId of oldest?.nodeIds ?? []) {
      const node = byId.get(nodeId);
      const context = run.contexts.get(nodeId);
      if (node === undefined || context === undefined) continue;
      for (const detection of node.detections) {
        if (done.has(detection.knownCase.id)) continue;
        done.add(detection.knownCase.id);
        actions.push({ action: detection.knownCase.action, context });
      }
    }
  }
  return actions;
}

/**
 * The context the fallback action renders: in an error tree, the context of the last node of the oldest chain, which
 * holds what the investigation found for it; otherwise the final context of the window.
 *
 * @param finalContext - Final context of the window
 * @param run - Investigated tree, if any
 * @param chains - Groups of chains, in time order
 * @returns The context of the fallback
 */
function fallbackContext(
  finalContext: RunbookContext,
  run: ErrorTreeRun | undefined,
  chains: ReadonlyArray<TreeChainGroup> | undefined,
): RunbookContext {
  const nodeIds = chains?.[0]?.members[0]?.nodeIds ?? [];
  const last = nodeIds[nodeIds.length - 1];
  return (last === undefined ? undefined : run?.contexts.get(last)) ?? finalContext;
}
