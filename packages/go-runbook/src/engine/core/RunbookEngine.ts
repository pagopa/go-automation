import { getErrorMessage } from '@pagopa/go-common/errors';
import type { GOLogger } from '@pagopa/go-common/logging';
import { GORegexCache } from '@pagopa/go-common/utils';
import type { Runbook } from '../types/Runbook.js';
import type { RunbookContext } from '../types/RunbookContext.js';
import type { RunbookExecutionResult } from '../types/RunbookExecutionResult.js';

import type { KnownCase } from '../types/KnownCase.js';
import type { CaseAction } from '../types/CaseAction.js';
import type { KnownCaseDetection } from '../types/KnownCaseDetection.js';
import { caseSummary } from './caseSummary.js';

import type { RunbookExecutionStatus } from '../types/RunbookExecutionStatus.js';
import type { WorkflowServices } from '../types/WorkflowServices.js';
import type { RunbookEngineOptions } from '../types/RunbookEngineOptions.js';
import { assertRequiredServices } from './assertRequiredServices.js';
import type { ExecutionEnvironment } from '../tracing/ExecutionEnvironment.js';

import { ActionExecutor } from '../actions/ActionExecutor.js';
import { TraceBuilder } from '../tracing/TraceBuilder.js';

import { RUNBOOK_ABORTED_MESSAGE } from '../context/RUNBOOK_ABORTED_MESSAGE.js';

import { compareByFirstMs } from './compareByFirstMs.js';
import { RunbookMaxIterationsError } from '../errors/RunbookMaxIterationsError.js';
import type { ErrorTreeRun } from '../types/ErrorTreeRun.js';
import type { TreeChainGroup } from '../types/TreeChainGroup.js';

import { ReadLedger } from '../reads/ReadLedger.js';
import { createInitialContext } from '../context/RunbookContextHelper.js';
import type { ExecutionState } from './ExecutionState.js';
import type { ActionExecutionResult } from '../actions/ActionExecutor.js';
import type { CaseMatch } from './CaseMatch.js';
import { ErrorTreeExecutor } from '../tree/ErrorTreeExecutor.js';
import type { EvidenceIdentifier } from '../types/EvidenceIdentifier.js';
import type { EvidenceIndices } from './EvidenceIndices.js';
import type { IdentifierObservation } from '../types/IdentifierObservation.js';
import type { ReadScope } from '../reads/ReadScope.js';
import type { StepDescriptor } from '../types/StepDescriptor.js';
import type { StepExecutionOutcome } from './StepExecutionOutcome.js';
import type { StepResult } from '../types/StepResult.js';
import type { StepsOutcome } from './StepsOutcome.js';
import type { TreeLevelReadResult } from '../types/TreeLevelReadResult.js';
import type { TreeLevelReader } from '../types/TreeLevelReader.js';
import type { TreeStepsRun } from '../types/TreeStepsRun.js';
import { addRecoveredError } from '../context/RunbookContextHelper.js';
import { buildTreeChains } from '../tree/buildTreeChains.js';
import { computeCaseLevels } from '../tree/computeCaseLevels.js';
import { failedResultUnlessAborted } from '../context/failedResultUnlessAborted.js';
import { identifierKey } from '../reads/identifierKey.js';
import { omitUndefined } from '@pagopa/go-common/utils';
import { parseStepRef } from '../context/parseStepRef.js';
import { resolveRef } from '../context/resolveRef.js';
import { sharedConditionEvaluator } from './ConditionEvaluator.js';
import { throwIfRunbookAborted } from '../context/throwIfRunbookAborted.js';
import { updateContextWithStepResult } from '../context/RunbookContextHelper.js';

/** Default maximum iterations for anti-loop protection */
const DEFAULT_MAX_ITERATIONS = 1000;

/** Default execution environment when none is provided */
const DEFAULT_ENVIRONMENT: ExecutionEnvironment = {
  invokedBy: 'manual',
};

/**
 * Main runbook execution engine.
 * Orchestrates step execution, flow control, case matching, and actions.
 *
 * features:
 * - Anti-loop protection with maxIterations
 * - continueOnFailure support for resilient steps
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
  /** Compiled regexes of this engine, shared by the contexts it runs. */
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
   * 2. Execute steps in sequence, until a step stops the pipeline
   * 3. Evaluate every known case, in declaration order
   * 4. Execute the action of every detection, in the order of the detections (or the fallback)
   * 5. Build and return execution result with trace
   *
   * With the `partial` read policy, a step that fails after some evidence has been collected does not fail the
   * execution: the pipeline stops, the failed read becomes an `unavailable` coverage entry and the known cases are
   * evaluated on the context reached.
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
    const ledger = new ReadLedger();
    const context: RunbookContext = {
      ...createInitialContext(params, services, signal, this.regexCache),
      reads: ledger.view(ledger.window),
      // The policy the runbook declares; without one it reads strictly, as every required step needs.
      readPolicy: runbook.readPolicy ?? 'strict',
      sharedReads: new Map(),
    };
    const maxIterations = runbook.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const env = environment ?? DEFAULT_ENVIRONMENT;
    const state: ExecutionState = {
      ledger,
      scope: ledger.window,
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
        runbook.readPolicy === 'partial',
      );
      finalContext = stepsResult.context;
      if (stepsResult.failureReason !== undefined) {
        status = 'failed';
        failureReason = stepsResult.failureReason;
        this.logger.error(`Runbook execution failed: ${failureReason}`);
      }
    } catch (error: unknown) {
      if (error instanceof RunbookMaxIterationsError) {
        throw error;
      }
      if (isAborted(context)) {
        this.logger.warning(RUNBOOK_ABORTED_MESSAGE);
      } else {
        status = 'failed';
        failureReason = getErrorMessage(error);
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

    let detections: ReadonlyArray<KnownCaseDetection> = [];
    let treeRun: ErrorTreeRun | undefined;
    let chains: ReadonlyArray<TreeChainGroup> | undefined;
    // A gap that names some identifiers is carried by their nodes, not by every chain.
    const windowIncomplete = ledger.windowIncomplete();
    if (status === 'completed' && !isAborted(finalContext)) {
      try {
        if (runbook.tree === undefined) {
          detections = this.detectKnownCases(runbook.knownCases, finalContext, traceBuilder);
        } else {
          treeRun = await this.investigateTree(runbook, finalContext, {
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
    }

    // Every detection runs its action, in the order of the detections; in an error tree, once per group of chains,
    // from the node that recognized the case. The fallback runs only when nothing matched.
    if (status === 'completed' && !isAborted(finalContext)) {
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

    // An abort, during the steps, the evaluation or the actions, thrown or not, ends the run aborted, with the trace
    // collected so far.
    if (status === 'completed' && isAborted(finalContext)) {
      status = 'aborted';
      failureReason = 'Execution aborted by signal';
      detections = [];
    }

    traceBuilder.traceCoverage(ledger.entries());
    const trace = traceBuilder.build(finalContext, status, env, failureReason);

    this.logger.info(
      `Runbook ${status}: ${runbook.metadata.id} in ${trace.execution.durationMs}ms ` +
        `(${trace.summary.stepsExecuted} steps, cases: ${caseSummary(detections)})`,
    );

    return {
      runbookId: runbook.metadata.id,
      status,
      detections,
      coverage: ledger.entries(),
      windowIncomplete,
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
   * Executes steps in sequence, until a step stops the pipeline.
   * Includes anti-loop protection and continueOnFailure support.
   *
   * A step that fails, by throwing or by returning its failure, with `continueOnFailure` is recovered: the failure is
   * recorded in `recoveredErrors` and the pipeline goes on. Any other failing step ends the pipeline. When some
   * evidence was already collected it is a partial read: the step becomes an `unavailable` coverage entry and the
   * execution stays completed. Otherwise the execution fails.
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
    const visitedSequence: string[] = [];

    for (const descriptor of stepDescriptors) {
      // Anti-loop protection
      if (visitedSequence.length >= maxIterations) {
        const lastStepId = visitedSequence[visitedSequence.length - 1] ?? 'unknown';
        throw new RunbookMaxIterationsError(runbookId, maxIterations, lastStepId, visitedSequence);
      }

      // Abort check before each step
      if (isAborted(context)) {
        this.logger.warning(RUNBOOK_ABORTED_MESSAGE);
        return { context, aborted: true };
      }

      const { step } = descriptor;
      visitedSequence.push(step.id);

      const evidenceBefore = state.evidenceCollected;
      const execution = await this.executeStepDescriptor(descriptor, context, traceBuilder);
      context = execution.context;
      const result = execution.result;
      recordStepEvidence(state, step.id, result);
      if (result.success && step.kind === 'data') state.evidenceCollected = true;

      if (!result.success) {
        state.ledger.recordFailure(state.scope, step.id, result.error);
        state.failures.push(result.error ?? `Step "${step.id}" failed`);
        // A step allowed to fail is recovered, whether it threw or returned its failure: the pipeline goes on.
        if (isRecovered(descriptor, result)) {
          const originalError = result.error ?? `Step "${step.id}" failed`;
          this.logger.warning(`[${step.id}] Step failed but continueOnFailure=true: ${originalError}`);
          context = addRecoveredError(context, { stepId: step.id, originalError, failedAt: new Date() });
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

      if (result.next === 'stop') break;
    }

    return { context, aborted: false };
  }

  private async executeStepDescriptor(
    descriptor: StepDescriptor,
    context: RunbookContext,
    traceBuilder: TraceBuilder,
  ): Promise<StepExecutionOutcome> {
    const { step } = descriptor;

    if (descriptor.silent !== true) {
      this.logger.text(`[${step.id}] ${step.label}`);
    }

    const stepStartTime = Date.now();
    const stepStartedAt = new Date(stepStartTime).toISOString();
    let result: StepResult<unknown>;

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
      // step is recovered or the evidence already collected makes it a partial read.
      result = failedResultUnlessAborted(context, error);
    }

    const stepCompletedAt = new Date().toISOString();
    const stepDurationMs = Date.now() - stepStartTime;

    const varsWritten: Readonly<Record<string, string>> = result.vars ?? {};
    traceBuilder.traceStep({
      stepId: step.id,
      label: step.label,
      kind: step.kind,
      reachedVia: 'sequential',
      startedAt: stepStartedAt,
      completedAt: stepCompletedAt,
      durationMs: stepDurationMs,
      status: result.success ? 'success' : 'failed',
      recovered: isRecovered(descriptor, result),
      input: stepInput,
      output: result.output ?? null,
      varsWritten,
      flowDirective: result.next ?? 'continue',
      ...omitUndefined({ diagnostics: result.diagnostics, error: result.error }),
    });

    return {
      context: updateContextWithStepResult(context, step.id, result),
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
   * Evaluates every known case against the final context and returns the detections.
   *
   * Cases are evaluated in declaration order and every match is kept. A case listed in the `supersedes` of another
   * matching case leaves the detections and stays in the trace with `supersededBy`. The detections are ordered by the
   * time of their evidence: `firstSeenAt` ascending, declaration order on ties, untimed detections last.
   *
   * @param knownCases - Known cases of the runbook
   * @param context - Final context
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
        ...omitUndefined({ supersededBy: replacedBy, nodeId }),
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
   * @param window - Context reached by the steps of the window
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
    const executor = new ErrorTreeExecutor(tree, computeCaseLevels(runbook.knownCases, tree), runbook.knownCases, {
      runSteps: async (steps, context, scope) =>
        this.runNodeSteps(steps, context, scope, {
          maxIterations,
          runbookId: runbook.metadata.id,
          traceBuilder,
          ledger: state.ledger,
        }),
      recordRead: (read, identifiers, result, startedAtMs) => {
        recordTreeRead(traceBuilder, read, identifiers, result, startedAtMs);
      },
      evaluateCases: (knownCases, context, nodeId) => this.detectKnownCases(knownCases, context, traceBuilder, nodeId),
      ledger: state.ledger,
    });
    return executor.run(window);
  }

  /**
   * Runs the steps of an error node in its own context: what they write stays in the node, and the gaps they declare
   * are recorded in its scope.
   *
   * @param steps - Steps of the level
   * @param context - Context of the node
   * @param scope - Scope of the node in the read ledger
   * @param execution - Iteration cap, runbook id, trace and read ledger of the execution
   * @returns The context reached, the failure if a step failed, and the descents the steps requested
   * @throws DOMException `AbortError` when the execution is aborted
   */
  private async runNodeSteps(
    steps: ReadonlyArray<StepDescriptor>,
    context: RunbookContext,
    scope: ReadScope,
    execution: {
      readonly maxIterations: number;
      readonly runbookId: string;
      readonly traceBuilder: TraceBuilder;
      readonly ledger: ReadLedger;
    },
  ): Promise<TreeStepsRun> {
    const nodeState: ExecutionState = {
      ledger: execution.ledger,
      scope,
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
    if (outcome.aborted) throwIfRunbookAborted(outcome.context);
    return {
      context: outcome.context,
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
    const observations = new Map<string, IdentifierObservation & { readonly firstMs?: number }>();

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
          const key = identifierKey(identifier);
          const previous = observations.get(key);
          const previousMs = previous?.firstMs;
          if (previous !== undefined && (at === undefined || (previousMs !== undefined && previousMs <= at))) continue;
          observations.set(key, {
            kind: identifier.kind,
            value: identifier.value,
            ...(at === undefined ? {} : { observedAt: new Date(at).toISOString(), firstMs: at }),
          });
        }
      }
    }

    return {
      ...omitUndefined({ firstMs, lastMs }),
      evidenceRows,
      observations: [...observations.values()]
        .sort(compareByFirstMs)
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
    const stepRef = parseStepRef(ref);
    if (stepRef === undefined || ref.includes('[')) continue;
    stepResults.set(stepRef.stepId, withoutElements(stepResults.get(stepRef.stepId), stepRef.path, indices));
  }
  return { ...context, stepResults };
}

/** The ref of an evidence array without the redundant `.output` of a step ref. */
function canonicalRef(ref: string): string {
  const stepRef = parseStepRef(ref);
  if (stepRef?.path[0] !== 'output') return ref;
  return ['steps', stepRef.stepId, ...stepRef.path.slice(1)].join('.');
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
  return compareByFirstMs(a, b) || a.declarationIndex - b.declarationIndex;
}

/**
 * Records what a step result adds to the evidence of the execution: its gaps, the errors it observed and the descents
 * it requested.
 *
 * @param state - State of the execution
 * @param stepId - Step that produced the result
 * @param result - Result of the step
 */
function recordStepEvidence(state: ExecutionState, stepId: string, result: StepResult<unknown>): void {
  state.ledger.recordStep(state.scope, stepId, result.coverage ?? []);
  if (result.observedErrors !== undefined) state.observedErrors = result.observedErrors;
  if (result.descend !== undefined) state.descends.push(...result.descend);
}

/**
 * Whether a step result is recovered: the step failed, by throwing or by returning its failure, and its descriptor
 * allows it to fail.
 *
 * @param descriptor - Descriptor of the step
 * @param result - Result of the step
 * @returns `true` when the pipeline goes on after the failure
 */
function isRecovered(descriptor: StepDescriptor, result: StepResult<unknown>): boolean {
  return !result.success && descriptor.continueOnFailure === true;
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
 * Records a grouped read of an error-tree level as a step of the trace; its gaps are the read ledger's.
 *
 * @param traceBuilder - Trace of the execution
 * @param read - Read of the level
 * @param identifiers - Identifiers of the batch
 * @param result - Result of the read
 * @param startedAtMs - Start of the read
 */
function recordTreeRead(
  traceBuilder: TraceBuilder,
  read: TreeLevelReader,
  identifiers: ReadonlyArray<EvidenceIdentifier>,
  result: TreeLevelReadResult,
  startedAtMs: number,
): void {
  const completedAtMs = Date.now();
  traceBuilder.traceStep({
    stepId: read.id,
    label: read.label,
    kind: read.kind,
    reachedVia: 'subPipeline',
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    status: result.success ? 'success' : 'failed',
    recovered: false,
    input: { identifiers: identifiers.map((identifier) => `${identifier.kind}=${identifier.value}`) },
    output: result.rows,
    varsWritten: {},
    flowDirective: 'continue',
    ...omitUndefined({ diagnostics: result.diagnostics, error: result.error }),
  });
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
    .map((detection, index) => ({ detection, index, firstMs: timeOf(detection.firstSeenAt) }))
    .sort((a, b) => compareByFirstMs(a, b) || a.index - b.index)
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
