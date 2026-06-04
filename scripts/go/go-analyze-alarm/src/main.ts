/**
 * Go Analyze Alarm - Main Logic Module
 *
 * Loads the alarm configuration, creates the AWS service registry,
 * selects the appropriate runbook, and executes it via the RunbookEngine.
 */

import { Core } from '@go-automation/go-common';
import { RunbookEngine, ConditionEvaluator, apigw, lambda } from '@go-automation/go-runbook';
import type { Runbook, ExecutionEnvironment } from '@go-automation/go-runbook';

import type { GoAnalyzeAlarmConfig } from './types/GoAnalyzeAlarmConfig.js';
import { buildAddressBookIoApiGwAlarmRunbook } from './libs/runbooks/pn-address-book-io-IO-ApiGwAlarm/runbook.js';
import { buildDeliveryB2BApiGwAlarmRunbook } from './libs/runbooks/pn-delivery-B2B-ApiGwAlarm/runbook.js';
import { buildDeliveryIoExpApiGwAlarmRunbook } from './libs/runbooks/pn-delivery-IO_EXP-ApiGwAlarm/runbook.js';
import { buildDeliveryPushB2BApiGwAlarmRunbook } from './libs/runbooks/pn-delivery-push-B2B-ApiGwAlarm/runbook.js';
import { buildIoAuthorizerLambdaRunbook } from './libs/runbooks/pn-ioAuthorizerLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildTokenExchangeLambdaRunbook } from './libs/runbooks/pn-tokenExchangeLambda-LogInvocationErrors-Alarm/runbook.js';
import { buildSlaViolationCheckerLambdaSqsRunbook } from './libs/runbooks/pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm/runbook.js';
import { buildApiKeyAuthorizerV2LambdaLogInvocationErrorsAlarmRunbook } from './libs/runbooks/pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm/runbook.js';
import { buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook } from './libs/runbooks/pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm/runbook.js';

import { DEFAULT_TIME_WINDOW_MINUTES } from './libs/runbooks/constants.js';
import { createServiceRegistry } from './libs/createServiceRegistry.js';
import { computeTimeRange } from './libs/computeTimeRange.js';
import { createTimeRangeReference } from './libs/createTimeRangeReference.js';
import { saveExecutionTrace } from './libs/saveExecutionTrace.js';
import { saveExecutionOutput } from './libs/saveExecutionOutput.js';

/** Runbook registry: maps alarm names to their runbook builders */
const RUNBOOK_REGISTRY = new Map<string, () => Runbook>([
  ['pn-address-book-io-IO-ApiGwAlarm', buildAddressBookIoApiGwAlarmRunbook],
  ['pn-delivery-B2B-ApiGwAlarm', buildDeliveryB2BApiGwAlarmRunbook],
  ['pn-delivery-IO_EXP-ApiGwAlarm', buildDeliveryIoExpApiGwAlarmRunbook],
  ['pn-delivery-push-B2B-ApiGwAlarm', buildDeliveryPushB2BApiGwAlarmRunbook],
  ['pn-ioAuthorizerLambda-LogInvocationErrors-Alarm', buildIoAuthorizerLambdaRunbook],
  ['pn-tokenExchangeLambda-LogInvocationErrors-Alarm', buildTokenExchangeLambdaRunbook],
  ['pn-slaViolationCheckerLambda-SQS-LogInvocationErrors-Alarm', buildSlaViolationCheckerLambdaSqsRunbook],
  [
    'pn-ApiKeyAuthorizerV2Lambda-LogInvocationErrors-Alarm',
    buildApiKeyAuthorizerV2LambdaLogInvocationErrorsAlarmRunbook,
  ],
  ['pn-jwksCacheRefreshLambda-LogInvocationErrors-Alarm', buildJwksCacheRefreshLambdaLogInvocationErrorsAlarmRunbook],
]);

/**
 * Main script execution function.
 *
 * @param script - The GOScript instance for logging and configuration
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoAnalyzeAlarmConfig>();

  script.logger.section('Go Analyze Alarm');
  script.logger.info(`Alarm: ${config.alarmName}`);
  script.logger.info(`Datetime: ${config.alarmDatetime}`);
  script.logger.info(`AWS Profiles: ${config.awsProfiles.join(', ')}`);

  // Lookup runbook for this alarm
  const runbookBuilder = RUNBOOK_REGISTRY.get(config.alarmName);
  if (runbookBuilder === undefined) {
    script.logger.error(`No runbook found for alarm: "${config.alarmName}"`);
    script.logger.info(`Available runbooks: ${[...RUNBOOK_REGISTRY.keys()].join(', ')}`);
    return;
  }

  // Build the runbook
  const runbook = runbookBuilder();
  script.logger.info(`Runbook: ${runbook.metadata.name} v${runbook.metadata.version}`);

  // Compute time range (single timestamp or first/last occurrence range)
  const reference = createTimeRangeReference(config.alarmDatetime, config.alarmDatetimeEnd);
  const { startTime, endTime } = computeTimeRange(reference, DEFAULT_TIME_WINDOW_MINUTES);
  script.logger.info(`Time range: ${startTime} → ${endTime}`);

  // Create params map for the runbook
  const params = new Map<string, string>([
    ['alarmName', config.alarmName],
    ['alarmDatetime', config.alarmDatetime],
    ['startTime', startTime],
    ['endTime', endTime],
  ]);

  if (config.awsProfiles.length === 0) {
    script.logger.error('No AWS profiles provided');
    return;
  }

  script.logger.info(`Using AWS profiles: ${script.aws.clients.profileNames.join(', ')}`);

  // Create service registry
  const services = createServiceRegistry(script);

  // Execute the runbook
  script.logger.section('Executing Runbook');

  const engine = new RunbookEngine(script.logger, new ConditionEvaluator());

  // Build execution environment for trace
  const environment: ExecutionEnvironment = {
    awsProfiles: config.awsProfiles,
    region: 'eu-south-1',
    invokedBy: 'manual',
  };

  const result = await engine.execute(runbook, params, services, environment);

  // Closing banner: dispatch by runbook kind (API Gateway vs Lambda),
  // consistent with the engine's final case-match outcome.
  const finalSummaryInput = {
    logger: script.logger,
    matchedCaseIds: result.matchedCases.map((c) => c.id),
    vars: result.finalContext.vars,
  };
  if (lambda.isLambdaRunbookContext(runbook.runbookContext)) {
    lambda.renderLambdaFinalSummary(finalSummaryInput);
  } else {
    apigw.renderApiGwFinalSummary(finalSummaryInput);
  }

  // Display results
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

  // Save execution trace to data directory
  const traceFile = await saveExecutionTrace(script, result, config.alarmName);
  await saveExecutionOutput(script, runbook, result, traceFile);
}
