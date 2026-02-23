/**
 * Go Analyze Alarm - Main Logic Module
 *
 * Loads the alarm configuration, creates the AWS service registry,
 * selects the appropriate runbook, and executes it via the RunbookEngine.
 */

import * as fs from 'fs/promises';

import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { AthenaClient } from '@aws-sdk/client-athena';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { fromIni } from '@aws-sdk/credential-provider-ini';

import { Core, Runbook } from '@go-automation/go-common';

import type { GoAnalyzeAlarmConfig } from './config.js';
import { buildAddressBookIoApiGwAlarmRunbook } from './libs/runbooks/address-book-io-api-gw-alarm/index.js';
import { DEFAULT_TIME_WINDOW_MINUTES } from './libs/runbooks/address-book-io-api-gw-alarm/constants.js';
import { buildDeliveryB2BApiGwAlarmRunbook } from './libs/runbooks/delivery-b2b-api-gw-alarm/index.js';

/** Runbook registry: maps alarm names to their runbook builders */
const RUNBOOK_REGISTRY = new Map<string, () => Runbook.Runbook>([
  ['pn-address-book-io-IO-ApiGwAlarm', buildAddressBookIoApiGwAlarmRunbook],
  ['pn-delivery-B2B-ApiGwAlarm', buildDeliveryB2BApiGwAlarmRunbook],
]);

/**
 * Creates a ServiceRegistry from an AWS SSO profile.
 *
 * @param profile - AWS SSO profile name
 * @returns ServiceRegistry with all services initialized
 */
function createServiceRegistry(profile: string): Runbook.ServiceRegistry {
  const credentials = fromIni({ profile });
  const region = 'eu-south-1';

  const cloudWatchLogsClient = new CloudWatchLogsClient({ region, credentials });
  const cloudWatchClient = new CloudWatchClient({ region, credentials });
  const athenaClient = new AthenaClient({ region, credentials });
  const dynamoDBClient = new DynamoDBClient({ region, credentials });

  return {
    cloudWatchLogs: new Runbook.CloudWatchLogsService(cloudWatchLogsClient),
    cloudWatchMetrics: new Runbook.CloudWatchMetricsService(cloudWatchClient),
    athena: new Runbook.AthenaService(athenaClient, 's3://placeholder-athena-results/'),
    dynamodb: new Runbook.RunbookDynamoDBService(dynamoDBClient),
    http: new Runbook.RunbookHttpService(),
  };
}

/**
 * Computes the time range from the alarm datetime string.
 * Returns start/end ISO strings with ±timeWindowMinutes.
 *
 * @param alarmDatetime - ISO 8601 timestamp of the alarm
 * @param timeWindowMinutes - Time window in minutes
 * @returns Start and end ISO strings
 */
function computeTimeRange(alarmDatetime: string, timeWindowMinutes: number): { startTime: string; endTime: string } {
  const alarmTime = new Date(alarmDatetime);
  if (Number.isNaN(alarmTime.getTime())) {
    throw new Error(`Invalid alarm datetime: "${alarmDatetime}". Expected ISO 8601 format.`);
  }

  const offsetMs = timeWindowMinutes * 60 * 1000;
  const start = new Date(alarmTime.getTime() - offsetMs);
  const end = new Date(alarmTime.getTime() + offsetMs);

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

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

/**
 * Saves the RunbookExecutionTrace as a JSON file in the script's data directory.
 * File name: trace-{alarmName}-{timestamp}.json
 *
 * @param script - The GOScript instance for path resolution
 * @param result - The runbook execution result containing the trace
 * @param alarmName - Alarm name used in the file name
 */
async function saveExecutionTrace(
  script: Core.GOScript,
  result: Runbook.RunbookExecutionResult,
  alarmName: string,
): Promise<void> {
  const fileName = `trace-${alarmName}.json`;
  const traceInfoPath = script.paths.resolvePathWithInfo(fileName, Core.GOPathType.OUTPUT);
  const tracePath = traceInfoPath.path;

  await fs.writeFile(tracePath, JSON.stringify(result.trace, null, 2), 'utf-8');

  script.logger.info(`Execution trace saved: ${tracePath}`);
}
