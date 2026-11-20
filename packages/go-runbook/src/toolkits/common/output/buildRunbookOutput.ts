import {
  type AWSCloudWatchLogsQueryStatistics,
  sumCloudWatchLogsQueryStatistics,
} from '@pagopa/go-aws/cloudwatch-logs/insights';
import { omitUndefined } from '@pagopa/go-common/utils';
import type { CaseAction } from '../../../engine/types/CaseAction.js';
import type { KnownCaseDetection } from '../../../engine/types/KnownCaseDetection.js';
import type { Runbook } from '../../../engine/types/Runbook.js';
import type { RunbookExecutionResult } from '../../../engine/types/RunbookExecutionResult.js';
import type { RunbookOutput } from './RunbookOutput.js';
import type { RunbookOutcome } from './RunbookOutcome.js';
import type { RunbookOutputContext } from './RunbookOutputContext.js';
import type { StepTrace } from '../../../engine/tracing/StepTrace.js';
import type {
  RunbookTelemetry,
  CloudWatchLogsTelemetry,
  CloudWatchLogsTelemetryQueryExecution,
} from '../telemetry/RunbookTelemetry.js';
import { emptyRunbookOutputContext } from './RunbookOutputContext.js';
import { buildAnalysisDraft } from '../analysis/draft/buildAnalysisDraft.js';
import { ANALYSIS_LOG_ACTION_RENDERER } from '../analysis/reporting/ANALYSIS_LOG_ACTION_RENDERER.js';
import { resolveActionMessage } from '../../../engine/actions/resolveActionMessage.js';
import { buildDeclaredOutputContext } from './buildDeclaredOutputContext.js';
import { buildErrorChains } from './buildErrorChains.js';
import { RUNBOOK_OUTPUT_SCHEMA_VERSION } from './RUNBOOK_OUTPUT_SCHEMA_VERSION.js';
import { detectionContext, detectionObservations, representativeContext } from './resultContexts.js';
import type { RunbookContext } from '../../../engine/types/RunbookContext.js';
import type { IdentifierObservation } from '../../../engine/types/IdentifierObservation.js';
import type { RunbookCoverageOutput } from './RunbookCoverageOutput.js';
import type { CoverageLevelOutput } from './CoverageLevelOutput.js';
import type { ErrorChainInterruptionReason } from '../../../engine/types/ErrorChainInterruptionReason.js';

export interface BuildRunbookOutputOptions {
  readonly traceFile?: string;
  readonly contextBuilder?: RunbookOutputContextBuilderFn;
}

export type RunbookOutputContextBuilderFn = (
  runbook: Runbook,
  result: RunbookExecutionResult,
) => RunbookOutputContext | undefined;

export function buildRunbookOutput(
  runbook: Runbook,
  result: RunbookExecutionResult,
  options: BuildRunbookOutputOptions = {},
): RunbookOutput {
  const trace = result.trace;
  const telemetry = buildRunbookTelemetry(trace.pipeline);
  const analysis = buildAnalysisDraft(runbook, result);
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
    outcome: buildOutcome(runbook, result),
    chains: buildErrorChains(result),
    coverage: {
      complete: evidenceComplete(result),
      sources: result.coverage,
      ...(result.observedErrors !== undefined ? { errors: result.observedErrors } : {}),
      ...treeCoverage(result),
    },
    ...(analysis !== undefined ? { analysis } : {}),
    ...(telemetry !== undefined ? { telemetry } : {}),
    context: buildDeclaredOutputContext(
      runbook,
      result,
      options.contextBuilder?.(runbook, result) ?? emptyRunbookOutputContext(),
    ),
  };
}

function buildRunbookTelemetry(steps: ReadonlyArray<StepTrace>): RunbookTelemetry | undefined {
  const cloudWatchLogs = buildCloudWatchLogsTelemetry(steps);
  if (cloudWatchLogs === undefined) {
    return undefined;
  }
  return { cloudWatchLogs };
}

function buildCloudWatchLogsTelemetry(steps: ReadonlyArray<StepTrace>): CloudWatchLogsTelemetry | undefined {
  const queryExecutions: CloudWatchLogsTelemetryQueryExecution[] = [];
  const statistics: AWSCloudWatchLogsQueryStatistics[] = [];

  for (const step of steps) {
    const diagnostics = step.diagnostics?.cloudWatchLogs;
    if (diagnostics === undefined) continue;

    statistics.push(diagnostics.statistics);
    for (const execution of diagnostics.queryExecutions) {
      queryExecutions.push({
        stepId: step.stepId,
        stepLabel: step.label,
        executionOrder: step.executionOrder,
        queryId: execution.queryId,
        profile: execution.profile,
        logGroups: execution.logGroups,
        statistics: execution.statistics,
      });
    }
  }

  if (statistics.length === 0) {
    return undefined;
  }

  return {
    queryCount: queryExecutions.length,
    statistics: sumCloudWatchLogsQueryStatistics(statistics),
    queryExecutions,
  };
}

function buildOutcome(runbook: Runbook, result: RunbookExecutionResult): RunbookOutcome {
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
    return buildKnownCaseMatchedOutcome(result);
  }

  if (runbook.metadata.type === 'alarm-resolution') {
    const complete = evidenceComplete(result);
    return {
      kind: complete ? 'unknown-case' : 'inconclusive',
      casesEvaluated: result.trace.caseMatching.casesEvaluated,
      ...resolvedActionMessage(runbook.fallbackAction, result),
      message: complete ? 'Nessun caso noto individuato' : 'Nessun caso noto individuato, con evidenza incompleta',
    };
  }

  if (result.finalContext.vars.get('procedureOutcome') === 'failure') {
    return buildProcedureFailureOutcome(result);
  }

  return buildProcedureSuccessOutcome(result);
}

function buildKnownCaseMatchedOutcome(result: RunbookExecutionResult): RunbookOutcome {
  const executed = result.trace.actionsExecuted.filter((action) => action.executed);
  const detections = result.detections.map((detection, index) =>
    detectionOutput(
      detection,
      detectionObservations(result, detection),
      (result.tree === undefined ? executed[index]?.resolvedMessage : undefined) ??
        resolveOutcomeMessage(detection.knownCase.action, result, detectionContext(result, detection)),
    ),
  );
  const [first] = result.detections;
  const message =
    result.detections.length === 1 && first !== undefined
      ? `Individuato caso noto: ${first.knownCase.description}`
      : `Individuati ${String(result.detections.length)} casi noti: ${result.detections.map((d) => d.knownCase.description).join(' | ')}`;
  return { kind: 'known-case-matched', detections, message };
}

function detectionOutput(
  detection: KnownCaseDetection,
  observations: ReadonlyArray<IdentifierObservation>,
  resolvedMessage: string | undefined,
): {
  readonly caseId: string;
  readonly description: string;
  readonly firstSeenAt?: string;
  readonly lastSeenAt?: string;
  readonly evidenceRows: number;
  readonly resolvedMessage?: string;
  readonly observations: ReadonlyArray<IdentifierObservation>;
} {
  return {
    caseId: detection.knownCase.id,
    description: detection.knownCase.description,
    ...(detection.firstSeenAt !== undefined ? { firstSeenAt: detection.firstSeenAt } : {}),
    ...(detection.lastSeenAt !== undefined ? { lastSeenAt: detection.lastSeenAt } : {}),
    evidenceRows: detection.evidenceRows,
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
    ...(failedStepId !== undefined ? { failedStepId } : {}),
    ...(error !== undefined ? { error } : {}),
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
): { readonly fallbackMessage?: string } {
  const resolved = resolveOutcomeMessage(action, result, representativeContext(result));
  return resolved === undefined ? {} : { fallbackMessage: resolved };
}

function resolveOutcomeMessage(
  action: CaseAction,
  result: RunbookExecutionResult,
  context: RunbookContext = result.finalContext,
): string | undefined {
  return resolveActionMessage(action, { vars: context.vars, params: context.params }, ANALYSIS_LOG_ACTION_RENDERER);
}

/**
 * Whether the evidence of an execution is complete: no partial read and, in an error tree, no interrupted chain.
 *
 * @param result - Result of the execution
 * @returns `true` when nothing is missing
 */
function evidenceComplete(result: RunbookExecutionResult): boolean {
  const interrupted = (result.chains ?? []).some((group) =>
    group.members.some((member) => member.end === 'interrupted'),
  );
  return result.coverage.length === 0 && !interrupted;
}

/** The nodes of each level and the interrupted chains of an error tree; nothing for a window-level runbook. */
function treeCoverage(result: RunbookExecutionResult): Pick<RunbookCoverageOutput, 'levels' | 'interruptions'> {
  if (result.tree === undefined) return {};
  type LevelCounts = { -readonly [K in keyof CoverageLevelOutput]-?: CoverageLevelOutput[K] };
  const levels = new Map<string, LevelCounts>();
  const level = (target: string): LevelCounts => {
    const existing = levels.get(target);
    if (existing !== undefined) return existing;
    const created: LevelCounts = { target, nodes: 0, recognized: 0, unrecognized: 0, failed: 0, lowerBound: false };
    levels.set(target, created);
    return created;
  };
  for (const node of result.tree) {
    const counts = level(node.target);
    counts.nodes += 1;
    if (node.status === 'failed') counts.failed += 1;
    else if (node.detections.length > 0) counts.recognized += 1;
    else counts.unrecognized += 1;
    if (node.parentId === undefined && result.observedErrors?.lowerBound === true) counts.lowerBound = true;
    // A level read incompletely for a parent, or not read at all, has at least the nodes it shows.
    for (const descent of node.descents) {
      const below = level(descent.target);
      if (descent.state !== 'queried') below.lowerBound = true;
    }
  }
  const interruptions = new Map<ErrorChainInterruptionReason, number>();
  for (const group of result.chains ?? []) {
    for (const member of group.members) {
      const reason = member.interruption?.reason;
      if (reason !== undefined) interruptions.set(reason, (interruptions.get(reason) ?? 0) + 1);
    }
  }
  return {
    levels: [...levels.values()].map(({ lowerBound, ...counts }) => (lowerBound ? { ...counts, lowerBound } : counts)),
    interruptions: [...interruptions.entries()].map(([reason, count]) => ({ reason, count })),
  };
}
