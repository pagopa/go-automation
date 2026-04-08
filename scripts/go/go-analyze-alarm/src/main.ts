/**
 * Go Analyze Alarm - Main Logic Module
 *
 * Loads the alarm configuration, creates the AWS service registry,
 * selects the appropriate runbook, and executes it via the RunbookEngine.
 */

import { Core, Runbook } from '@go-automation/go-common';

import type { GoAnalyzeAlarmConfig } from './types/GoAnalyzeAlarmConfig.js';
import { buildAddressBookIoApiGwAlarmRunbook } from './libs/runbooks/address-book-io-api-gw-alarm/index.js';
import { buildDeliveryB2BApiGwAlarmRunbook } from './libs/runbooks/delivery-b2b-api-gw-alarm/index.js';
import { DEFAULT_TIME_WINDOW_MINUTES } from './libs/runbooks/address-book-io-api-gw-alarm/constants.js';
import { createServiceRegistry } from './libs/createServiceRegistry.js';
import { computeTimeRange } from './libs/computeTimeRange.js';
import { saveExecutionTrace } from './libs/saveExecutionTrace.js';

/** Runbook registry: maps alarm names to their runbook builders */
const RUNBOOK_REGISTRY = new Map<string, () => Runbook.Runbook>([
  ['pn-address-book-io-IO-ApiGwAlarm', buildAddressBookIoApiGwAlarmRunbook],
  ['pn-delivery-B2B-ApiGwAlarm', buildDeliveryB2BApiGwAlarmRunbook],
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

  // Compute time range
  const { startTime, endTime } = computeTimeRange(config.alarmDatetime, DEFAULT_TIME_WINDOW_MINUTES);
  script.logger.info(`Time range: ${startTime} → ${endTime}`);

  // Create params map for the runbook
  const params = new Map<string, string>([
    ['alarmName', config.alarmName],
    ['alarmDatetime', config.alarmDatetime],
    ['startTime', startTime],
    ['endTime', endTime],
  ]);

  // Use the first AWS profile for the service registry
  const firstProfile = config.awsProfiles[0];
  if (firstProfile === undefined) {
    script.logger.error('No AWS profiles provided');
    return;
  }

  script.logger.info(`Using AWS profile: ${firstProfile}`);

  // Create service registry
  const services = createServiceRegistry(firstProfile);

  // Execute the runbook
  script.logger.section('Executing Runbook');

  const engine = new Runbook.RunbookEngine(script.logger, new Runbook.ConditionEvaluator());

  // Build execution environment for trace
  const environment: Runbook.ExecutionEnvironment = {
    awsProfiles: config.awsProfiles,
    region: 'eu-south-1',
    invokedBy: 'manual',
  };

  const result = await engine.execute(runbook, params, services, environment);

  // Display results
  script.logger.section('Runbook Result');
  script.logger.info(`Status: ${result.status}`);
  script.logger.info(`Steps executed: ${result.stepsExecuted}`);
  script.logger.info(`Duration: ${result.durationMs}ms`);

  if (result.matchedCase !== undefined) {
    script.logger.info(`Matched case: ${result.matchedCase.description}`);
  } else {
    script.logger.warning('No known case matched');
  }

  if (result.recoveredErrors.length > 0) {
    script.logger.info(`Recovered errors: ${result.recoveredErrors.length}`);
    for (const err of result.recoveredErrors) {
      script.logger.text(`  - [${err.stepId}] ${err.originalError}`);
    }
  }

  // Save execution trace to data directory
  await saveExecutionTrace(script, result, config.alarmName);
}
