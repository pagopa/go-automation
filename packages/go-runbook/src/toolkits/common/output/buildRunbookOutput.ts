import { omitUndefined } from '@pagopa/go-common/utils';
import type {
  CaseAction,
  IdentifierObservation,
  KnownErrorDetection,
  Runbook,
  RunbookContext,
  RunbookExecutionResult,
} from '../../../engine/index.js';
import { resolveActionMessage } from '../../../engine/index.js';
import type { RunbookOutput } from './RunbookOutput.js';
import type { RunbookOutcome } from './RunbookOutcome.js';
import { buildRunbookTelemetry } from '../telemetry/buildRunbookTelemetry.js';
import { emptyRunbookOutputContext } from './RunbookOutputContext.js';
import { analysisDraftOf } from '../analysis/draft/buildAnalysisDraft.js';
import { ANALYSIS_LOG_ACTION_RENDERER } from '../analysis/reporting/ANALYSIS_LOG_ACTION_RENDERER.js';
import { buildDeclaredOutputContext } from './buildDeclaredOutputContext.js';
import { buildFamilyOutputContext } from './buildFamilyOutputContext.js';
import { errorChainsOf } from './buildErrorChains.js';
import { coverageLinesOf } from './buildCoverageLines.js';
import { ErrorTreeView } from './tree/ErrorTreeView.js';
import { detectionOccurrences, errorsByCase } from './detectionOccurrences.js';
import { RUNBOOK_OUTPUT_SCHEMA_VERSION } from './RUNBOOK_OUTPUT_SCHEMA_VERSION.js';
import { detectionContext, detectionObservations, representativeContext } from './resultContexts.js';
import type { RunbookCoverageOutput } from './RunbookCoverageOutput.js';
import type { BuildRunbookOutputOptions } from './BuildRunbookOutputOptions.js';
import type { KnownErrorDetectionOutput } from './KnownErrorDetectionOutput.js';

/**
 * Builds the output of a runbook execution: metadata, execution, outcome, error chains, coverage, analysis draft,
 * telemetry and the declared output context.
 *
 * @param runbook - The executed runbook
 * @param result - Result of the execution
 * @param options - Trace file and builder of the family output context (default: the context of the runbook family)
 * @returns The runbook output
 */
export function buildRunbookOutput(
  runbook: Runbook,
  result: RunbookExecutionResult,
  options: BuildRunbookOutputOptions = {},
): RunbookOutput {
  const trace = result.trace;
  const telemetry = buildRunbookTelemetry(trace);
  const view = new ErrorTreeView(result);
  const chains = errorChainsOf(result, view);
  const analysis = analysisDraftOf(runbook, result, { view, chains, coverageLines: coverageLinesOf(result, view) });
  return {
    schemaVersion: RUNBOOK_OUTPUT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    runbook: {
      id: runbook.metadata.id,
      name: runbook.metadata.name,
      type: runbook.metadata.type,
      version: runbook.metadata.version,
      team: runbook.metadata.team,
    },
    execution: {
      executionId: trace.execution.executionId,
      startedAt: trace.execution.startedAt,
      completedAt: trace.execution.completedAt,
      durationMs: result.durationMs,
      status: result.status,
      stepsExecuted: result.stepsExecuted,
      ...(options.traceFile !== undefined ? { traceFile: options.traceFile } : {}),
      recoveredErrors: result.recoveredErrors.map((err) => ({
        stepId: err.stepId,
        error: err.originalError,
      })),
    },
    input: trace.input,
    outcome: buildOutcome(runbook, result, view),
    // The list of every path stays in the trace: the output keeps the counts, routes and samples of each group.
    chains: chains.map(({ members: _members, ...summary }) => summary),
    coverage: {
      complete: evidenceComplete(result, view),
      sources: result.coverage,
      ...(result.observedErrors !== undefined ? { errors: result.observedErrors } : {}),
      ...treeCoverage(result, view),
    },
    ...omitUndefined({ analysis, telemetry }),
    context: buildDeclaredOutputContext(
      runbook,
      result,
      (options.contextBuilder ?? buildFamilyOutputContext)(runbook, result) ?? emptyRunbookOutputContext(),
      view,
    ),
  };
}

function buildOutcome(runbook: Runbook, result: RunbookExecutionResult, view: ErrorTreeView): RunbookOutcome {
  if (result.status === 'aborted') {
    return {
      kind: 'aborted',
      ...(result.trace.execution.failureReason !== undefined ? { reason: result.trace.execution.failureReason } : {}),
      message: result.trace.summary.description,
    };
  }

  if (result.status === 'failed') {
    const failedStep = result.trace.pipeline.find((step) => step.status === 'failed' && !step.recovered);
    return {
      kind: 'failed',
      ...omitUndefined({
        reason: result.trace.execution.failureReason,
        failedStepId: failedStep?.stepId,
        error: failedStep?.error,
      }),
      message: result.trace.summary.description,
    };
  }

  if (result.detections.length > 0) {
    return buildKnownErrorMatchedOutcome(result, view);
  }

  if (runbook.metadata.type === 'alarm-resolution') {
    const complete = evidenceComplete(result, view);
    return {
      kind: complete ? 'unknown-error' : 'inconclusive',
      casesEvaluated: result.trace.caseMatching.casesEvaluated,
      ...resolvedActionMessage(runbook.fallbackAction, result, view),
      message: complete ? 'Nessun caso noto individuato' : 'Nessun caso noto individuato, con evidenza incompleta',
    };
  }

  if (result.finalContext.vars.get('procedureOutcome') === 'failure') {
    return buildProcedureFailureOutcome(result);
  }

  return buildProcedureSuccessOutcome(result);
}

function buildKnownErrorMatchedOutcome(result: RunbookExecutionResult, view: ErrorTreeView): RunbookOutcome {
  const executed = result.trace.actionsExecuted.filter((action) => action.executed);
  const detected = result.detections.map((detection, index) => {
    const node = view.nodeOf(detection);
    return {
      output: detectionOutput(
        detection,
        detectionObservations(view, detection),
        (result.tree === undefined ? executed[index]?.resolvedMessage : undefined) ??
          resolveOutcomeMessage(detection.knownError.action, detectionContext(result, view, detection)),
      ),
      // Without a tree every detection is an error of its own.
      errorKey: node?.errorKey ?? `detection:${String(index)}`,
      inTree: node !== undefined,
    };
  });
  // One entry per case and request, and one line per case: never one per node.
  const cases = errorsByCase(detected);
  const named = cases.map(({ description, errors }) =>
    errors > 1 ? `${description} (${String(errors)} errori)` : description,
  );
  const message =
    cases.length === 1
      ? `Individuato caso noto: ${named[0] ?? ''}`
      : `Individuati ${String(cases.length)} casi noti: ${named.join(' | ')}`;
  return { kind: 'known-error-matched', detections: detectionOccurrences(detected), message };
}

function detectionOutput(
  detection: KnownErrorDetection,
  observations: ReadonlyArray<IdentifierObservation>,
  resolvedMessage: string | undefined,
): KnownErrorDetectionOutput {
  return {
    code: detection.knownError.code,
    description: detection.knownError.description,
    ...omitUndefined({
      analysisType: detection.knownError.analysis?.analysisType,
      firstSeenAt: detection.firstSeenAt,
      lastSeenAt: detection.lastSeenAt,
    }),
    evidenceRows: detection.evidenceRows,
    errors: 1,
    ...(resolvedMessage !== undefined ? { resolvedMessage } : {}),
    observations,
  };
}

function buildProcedureSuccessOutcome(result: RunbookExecutionResult): RunbookOutcome {
  const metrics = collectProcedureMetrics(result);
  return {
    kind: 'procedure-success',
    summary: result.finalContext.vars.get('procedureMessage') ?? result.trace.summary.outcome,
    ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
  };
}

function buildProcedureFailureOutcome(result: RunbookExecutionResult): RunbookOutcome {
  const metrics = collectProcedureMetrics(result);
  const failedStepId = result.finalContext.vars.get('procedureFailedStepId');
  const error = result.finalContext.vars.get('procedureError');
  return {
    kind: 'procedure-failure',
    summary: result.finalContext.vars.get('procedureMessage') ?? result.trace.summary.outcome,
    ...omitUndefined({ failedStepId, error }),
    ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
  };
}

function collectProcedureMetrics(result: RunbookExecutionResult): Readonly<Record<string, number | string>> {
  const metrics: Record<string, number | string> = {};
  for (const [key, value] of result.finalContext.vars) {
    if (!key.startsWith('procedureMetric.')) continue;
    const metricName = key.slice('procedureMetric.'.length);
    if (metricName === '') continue;
    const numeric = Number(value);
    metrics[metricName] = Number.isNaN(numeric) ? value : numeric;
  }
  return metrics;
}

function resolvedActionMessage(
  action: CaseAction,
  result: RunbookExecutionResult,
  view: ErrorTreeView,
): { readonly fallbackMessage?: string } {
  const resolved = resolveOutcomeMessage(action, representativeContext(result, view));
  return resolved === undefined ? {} : { fallbackMessage: resolved };
}

function resolveOutcomeMessage(action: CaseAction, context: RunbookContext): string | undefined {
  return resolveActionMessage(action, { vars: context.vars, params: context.params }, ANALYSIS_LOG_ACTION_RENDERER);
}

/**
 * Whether the evidence of an execution is complete: no partial read and, in an error tree, no interrupted chain.
 *
 * @param result - Result of the execution
 * @returns `true` when nothing is missing
 */
function evidenceComplete(result: RunbookExecutionResult, view: ErrorTreeView): boolean {
  return result.coverage.length === 0 && !view.hasInterruptedChains();
}

/** The nodes of each level and the interrupted chains of an error tree; nothing for a window-level runbook. */
function treeCoverage(
  result: RunbookExecutionResult,
  view: ErrorTreeView,
): Pick<RunbookCoverageOutput, 'levels' | 'interruptions'> {
  if (!view.hasTree) return {};
  return {
    levels: view.levels(result.observedErrors),
    interruptions: [...view.interruptions()].map(([reason, count]) => ({ reason, count })),
  };
}
