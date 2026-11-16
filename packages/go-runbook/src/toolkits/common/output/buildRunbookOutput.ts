import {
  type AWSCloudWatchLogsQueryStatistics,
  sumCloudWatchLogsQueryStatistics,
} from '@pagopa/go-aws/cloudwatch-logs/insights';
import { omitUndefined } from '@pagopa/go-common/utils';
import type { CaseAction } from '../../../engine/types/CaseAction.js';
import type { KnownCase } from '../../../engine/types/KnownCase.js';
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
    schemaVersion: '1.0.0',
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
      earlyResolution: result.earlyResolution === true,
      ...(result.resolvedAtStep !== undefined ? { resolvedAtStep: result.resolvedAtStep } : {}),
      ...(options.traceFile !== undefined ? { traceFile: options.traceFile } : {}),
      recoveredErrors: result.recoveredErrors.map((err) => ({
        stepId: err.stepId,
        error: err.originalError,
      })),
    },
    input: trace.input,
    outcome: buildOutcome(runbook, result),
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

  if (result.matchedCases.length > 0) {
    return buildKnownCaseMatchedOutcome(result);
  }

  if (runbook.metadata.type === 'alarm-resolution') {
    return {
      kind: 'unknown-case',
      casesEvaluated: result.trace.caseMatching.casesEvaluated,
      ...resolvedActionMessage(runbook.fallbackAction, result),
      message: 'Nessun caso noto individuato',
    };
  }

  if (result.finalContext.vars.get('procedureOutcome') === 'failure') {
    return buildProcedureFailureOutcome(result);
  }

  return buildProcedureSuccessOutcome(result);
}

function buildKnownCaseMatchedOutcome(result: RunbookExecutionResult): RunbookOutcome {
  const primary = result.matchedCases[0];
  if (primary === undefined) {
    throw new Error('Cannot build known-case outcome without a primary matched case.');
  }

  return {
    kind: 'known-case-matched',
    primaryCaseId: primary.id,
    primaryCaseDescription: primary.description,
    matchedCases: result.matchedCases.map((knownCase) => knownCaseOutput(knownCase, result)),
    message: `Individuato caso noto: ${primary.description}`,
  };
}

function knownCaseOutput(
  knownCase: KnownCase,
  result: RunbookExecutionResult,
): {
  readonly id: string;
  readonly description: string;
  readonly priority: number;
  readonly resolvedMessage?: string;
} {
  const resolvedMessage =
    result.matchedCases[0]?.id === knownCase.id
      ? result.trace.actionsExecuted.find((action) => action.executed)?.resolvedMessage
      : resolveOutcomeMessage(knownCase.action, result);

  return {
    id: knownCase.id,
    description: knownCase.description,
    priority: knownCase.priority,
    ...(resolvedMessage !== undefined ? { resolvedMessage } : {}),
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
  const resolved = resolveOutcomeMessage(action, result);
  return resolved === undefined ? {} : { fallbackMessage: resolved };
}

function resolveOutcomeMessage(action: CaseAction, result: RunbookExecutionResult): string | undefined {
  return resolveActionMessage(
    action,
    { vars: result.finalContext.vars, params: result.finalContext.params },
    ANALYSIS_LOG_ACTION_RENDERER,
  );
}
