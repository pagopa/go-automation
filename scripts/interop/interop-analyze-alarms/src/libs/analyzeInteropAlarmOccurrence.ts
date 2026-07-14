import { Core } from '@go-automation/go-common';

import type { InteropAlarmOccurrence } from '../types/index.js';
import { buildApplicationLogsErrorsQuery, buildCidTrackerQuery } from './interopQueries.js';
import { createOccurrenceTimeRange } from './createOccurrenceTimeRange.js';
import { resolveInteropAlarmContext } from './resolveInteropAlarmContext.js';
import { arrayValuesToCsvString, collectDistinctCids, rowsWithoutCid } from './resultFields.js';

const WINDOW_SECONDS_BEFORE_ALARM = 300;
const WINDOW_SECONDS_AFTER_ALARM = 120;

interface AnalyzeInteropAlarmOccurrenceInput {
  readonly script: Core.GOScript;
  readonly occurrence: InteropAlarmOccurrence;
  readonly requestedAlarmName?: string;
  readonly noCidLogArray: string[];
  readonly cidLogArray: string[];
}

export async function analyzeInteropAlarmOccurrence(input: AnalyzeInteropAlarmOccurrenceInput): Promise<boolean> {
  const alarmContext = resolveAlarmContext(input);
  if (alarmContext === undefined) return false;

  const timestamp = input.occurrence.alarmTimestamp;
  input.script.logger.section(timestamp);
  if (input.requestedAlarmName === undefined) {
    input.script.logger.info(`Alarm: ${input.occurrence.alarmName}`);
  }

  const timeRange = createOccurrenceTimeRange(timestamp, WINDOW_SECONDS_BEFORE_ALARM, WINDOW_SECONDS_AFTER_ALARM);
  const applicationLogsQuery = buildApplicationLogsErrorsQuery(alarmContext);

  input.script.prompt.startSpinner('Executing Application-Logs-Errors query...');
  const applicationLogsRows = await input.script.aws.services.cloudWatchLogs.query(
    [applicationLogsQuery.logGroup],
    applicationLogsQuery.query,
    timeRange,
  );
  input.script.prompt.stopSpinner();

  input.script.logger.step('Retrieving logs without CID');
  for (const row of rowsWithoutCid(applicationLogsRows)) {
    input.noCidLogArray.push(arrayValuesToCsvString(row));
  }

  const cids = collectDistinctCids(applicationLogsRows);
  for (const cid of cids) {
    input.script.logger.step(`Querying cid: ${cid}`);
    const cidTrackerQuery = buildCidTrackerQuery(alarmContext, cid);
    const cidResults = await input.script.aws.services.cloudWatchLogs.query(
      [cidTrackerQuery.logGroup],
      cidTrackerQuery.query,
      timeRange,
    );

    for (const row of cidResults) {
      input.cidLogArray.push(arrayValuesToCsvString(row));
    }
    input.cidLogArray.push(`--- End cid ${cid} ---`);
  }

  input.cidLogArray.push(`********* End ${timestamp} analysis *********`);
  return true;
}

function resolveAlarmContext(
  input: AnalyzeInteropAlarmOccurrenceInput,
): ReturnType<typeof resolveInteropAlarmContext> | undefined {
  try {
    return resolveInteropAlarmContext(input.occurrence.alarmName);
  } catch (error) {
    if (input.requestedAlarmName !== undefined) throw error;
    input.script.logger.warning(`Skipping unsupported alarm "${input.occurrence.alarmName}": ${errorMessage(error)}`);
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
