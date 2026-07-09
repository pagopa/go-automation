/**
 * Go Analyze Alarm - Main Logic Module
 *
 * Loads the alarm configuration, creates the AWS service registry,
 * selects the appropriate runbook, and executes it via the RunbookEngine.
 */

import { Core } from '@go-automation/go-common';

import type { GoAnalyzeAlarmConfig } from './types/GoAnalyzeAlarmConfig.js';
import { analyzeOccurrence } from './libs/analyzeOccurrence.js';
import { assertRangeModeConfig, findAlarmOccurrences } from './libs/findAlarmOccurrences.js';
import { RUNBOOK_REGISTRY } from './libs/runbookRegistry.js';

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
  script.logger.info(`Analysis mode: ${config.analysisMode}`);
  script.logger.info(`AWS Profiles: ${config.awsProfiles.join(', ')}`);

  assertRangeModeConfig(config);

  const runbookBuilder = RUNBOOK_REGISTRY.get(config.alarmName);
  if (runbookBuilder === undefined) {
    script.logger.error(`No runbook found for alarm: "${config.alarmName}"`);
    script.logger.info(`Available runbooks: ${[...RUNBOOK_REGISTRY.keys()].join(', ')}`);
    return;
  }

  if (config.awsProfiles.length === 0) {
    script.logger.error('No AWS profiles provided');
    return;
  }

  if (config.analysisMode === 'single') {
    await analyzeOccurrence(script, config, runbookBuilder, {
      alarmDatetime: config.alarmDatetime,
      ...(config.alarmDatetimeEnd === undefined ? {} : { alarmDatetimeEnd: config.alarmDatetimeEnd }),
    });
    return;
  }

  const occurrences = await findAlarmOccurrences(script, config);
  if (occurrences.length === 0) {
    script.logger.info(
      `No OK → ALARM occurrences found for alarm "${config.alarmName}" between ${config.alarmDatetime} and ${config.alarmDatetimeEnd}`,
    );
    return;
  }

  script.logger.info(`Found ${occurrences.length} OK → ALARM occurrence(s) for "${config.alarmName}"`);
  for (const occurrence of occurrences) {
    script.logger.section(`Occurrence ${occurrence}`);
    await analyzeOccurrence(script, config, runbookBuilder, {
      alarmDatetime: occurrence,
      outputSuffix: occurrence,
    });
  }
}
