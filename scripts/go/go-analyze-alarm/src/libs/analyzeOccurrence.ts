import { Core } from '@go-automation/go-common';
import { RunbookEngine, ConditionEvaluator, apigw, lambda, service } from '@go-automation/go-runbook';
import type { ExecutionEnvironment, Runbook, RunbookExecutionResult } from '@go-automation/go-runbook';

import type { GoAnalyzeAlarmConfig } from '../types/GoAnalyzeAlarmConfig.js';
import type { RunbookBuilderFn } from './runbookRegistry.js';
import { DEFAULT_TIME_WINDOW_MINUTES } from './runbooks/constants.js';
import { createServiceRegistry } from './createServiceRegistry.js';
import { computeTimeRange } from './computeTimeRange.js';
import { createTimeRangeReference } from './createTimeRangeReference.js';
import { saveExecutionTrace } from './saveExecutionTrace.js';
import { saveExecutionOutput } from './saveExecutionOutput.js';

export interface AnalyzeOccurrenceInput {
  readonly alarmDatetime: string;
  readonly alarmDatetimeEnd?: string;
  readonly outputSuffix?: string;
}

export async function analyzeOccurrence(
  script: Core.GOScript,
  config: GoAnalyzeAlarmConfig,
  runbookBuilder: RunbookBuilderFn,
  input: AnalyzeOccurrenceInput,
): Promise<void> {
  const runbook = runbookBuilder();
  script.logger.info(`Runbook: ${runbook.metadata.name} v${runbook.metadata.version}`);

  const reference = createTimeRangeReference(input.alarmDatetime, input.alarmDatetimeEnd);
  const { startTime, endTime } = computeTimeRange(reference, DEFAULT_TIME_WINDOW_MINUTES);
  script.logger.info(`Time range: ${startTime} → ${endTime}`);

  const params = new Map<string, string>([
    ['alarmName', config.alarmName],
    ['alarmDatetime', input.alarmDatetime],
    ['startTime', startTime],
    ['endTime', endTime],
  ]);
  if (input.alarmDatetimeEnd !== undefined && input.alarmDatetimeEnd.trim() !== '') {
    params.set('alarmDatetimeEnd', input.alarmDatetimeEnd);
  }

  script.logger.info(`Using AWS profiles: ${script.aws.clients.profileNames.join(', ')}`);

  const services = createServiceRegistry(script);

  script.logger.section('Executing Runbook');

  const engine = new RunbookEngine(script.logger, new ConditionEvaluator());
  const environment: ExecutionEnvironment = {
    awsProfiles: config.awsProfiles,
    region: 'eu-south-1',
    invokedBy: 'manual',
  };

  const result = await engine.execute(runbook, params, services, environment);

  renderFinalSummary(script, runbook, result);
  renderRunbookResult(script, result);

  const traceFile = await saveExecutionTrace(script, result, config.alarmName, input.outputSuffix);
  await saveExecutionOutput(script, runbook, result, traceFile, input.outputSuffix);
}

function renderFinalSummary(script: Core.GOScript, runbook: Runbook, result: RunbookExecutionResult): void {
  const finalSummaryInput = {
    logger: script.logger,
    matchedCaseIds: result.matchedCases.map((c) => c.id),
    vars: result.finalContext.vars,
  };

  if (lambda.isLambdaRunbookContext(runbook.runbookContext)) {
    lambda.renderLambdaFinalSummary(finalSummaryInput);
    return;
  }

  if (apigw.isApiGwRunbookContext(runbook.runbookContext)) {
    apigw.renderApiGwFinalSummary(finalSummaryInput);
    return;
  }

  if (service.isServiceRunbookContext(runbook.runbookContext)) {
    script.logger.section('Service Runbook Summary');
    script.logger.info(`Service: ${runbook.runbookContext.service.name}`);
  }
}

function renderRunbookResult(script: Core.GOScript, result: RunbookExecutionResult): void {
  script.logger.section('Runbook Result');
  script.logger.info(`Status: ${result.status}`);
  script.logger.info(`Steps executed: ${result.stepsExecuted}`);
  script.logger.info(`Duration: ${result.durationMs}ms`);

  const [primary, ...rest] = result.matchedCases;
  if (primary === undefined) {
    script.logger.warning('No known case matched');
  } else if (rest.length === 0) {
    script.logger.info(`Matched case: ${primary.description}`);
  } else {
    script.logger.info(`Matched cases (${result.matchedCases.length}):`);
    for (const c of result.matchedCases) {
      script.logger.info(`  - ${c.id} (priority ${c.priority}): ${c.description}`);
    }
  }

  if (result.recoveredErrors.length > 0) {
    script.logger.info(`Recovered errors: ${result.recoveredErrors.length}`);
    for (const err of result.recoveredErrors) {
      script.logger.text(`  - [${err.stepId}] ${err.originalError}`);
    }
  }
}
