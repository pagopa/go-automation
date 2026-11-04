/**
 * Go Report Error Patterns - Main Logic Module
 *
 * Implements CloudWatch alarm history querying, automatic evaluation datapoint time-window
 * extraction, pattern analysis execution and frequency reporting.
 */

import { Core } from '@go-automation/go-common';
import {
  AWSCloudWatchAlarmsService,
  AWSCloudWatchLogsService,
  AWSAccountProfileSet,
} from '@go-automation/go-common/aws';

import type {
  GoReportErrorPatternsConfig,
  AlarmPatternConfigFile,
  AlarmOccurrencePatternReport,
  AlarmOccurrence,
} from './types/index.js';
import { parseDateInput, extractAlarmOccurrenceWindow } from './libs/alarm-evaluator.js';
import {
  queryPatternsForOccurrence,
  aggregatePatternFrequencies,
  type OccurrenceQueryResult,
} from './libs/pattern-analyzer.js';
import { printPatternReport, exportPatternReports } from './libs/report.js';

/**
 * Main script execution function
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: Core.GOScript): Promise<void> {
  script.logger.section('Starting Go Report Error Patterns');

  const config = await script.getConfiguration<GoReportErrorPatternsConfig>();

  const configFileImporter = new Core.GOJSONFileImporter({
    inputPath: config.configFile,
  });
  const rawConfigFile = await configFileImporter.import();
  const configFiles: AlarmPatternConfigFile[] = Array.isArray(rawConfigFile)
    ? (rawConfigFile as AlarmPatternConfigFile[])
    : [rawConfigFile as AlarmPatternConfigFile];

  const allReports: AlarmOccurrencePatternReport[] = [];

  for (const item of configFiles) {
    const alarmName = item['alarm-name'];
    const logGroup = item['log-group'];
    const queryString = item['query-aws-cloudwatch'];
    const bufferSeconds = item['buffer-seconds'] ?? 0;

    const startDate = parseDateInput(item['alarm-history-start-date']);
    const endDate = parseDateInput(item['alarm-history-end-date']);

    script.logger.info(`Analisi configurazione per allarme: "${alarmName}"`);
    script.logger.info(`Intervallo ricerca allarme: ${startDate.toISOString()} -> ${endDate.toISOString()}`);
    script.logger.info(`Log Group: ${logGroup}`);

    for (const profile of config.awsProfiles) {
      script.logger.section(`Esecuzione su profilo AWS: ${profile}`);

      const clientProvider = script.aws.clients.get(profile);
      const alarmsService = new AWSCloudWatchAlarmsService(clientProvider.cloudWatch);

      const profileSet = new AWSAccountProfileSet(script.aws.clients, [profile]);
      const logsService = new AWSCloudWatchLogsService(profileSet);

      script.logger.info(`Recupero transizioni di stato dell'allarme "${alarmName}"...`);
      const transitions = await alarmsService.describeAlarmStateTransitions({
        alarmName,
        timeRange: {
          start: startDate,
          end: endDate,
        },
      });

      script.logger.info(`Trovate ${transitions.length} transizioni verso ALARM.`);

      const occurrences: AlarmOccurrence[] = [];
      for (const t of transitions) {
        const occ = extractAlarmOccurrenceWindow(t, bufferSeconds);
        if (occ) {
          occurrences.push(occ);
        }
      }

      const occurrenceResults: OccurrenceQueryResult[] = [];

      for (let i = 0; i < occurrences.length; i++) {
        const occ = occurrences[i];
        if (!occ) continue;

        script.logger.info(
          `[${i + 1}/${occurrences.length}] Esecuzione query pattern per allarme delle ${occ.timestamp.toISOString()} (finestra: ${occ.queryStartTime.toISOString()} -> ${occ.queryEndTime.toISOString()})...`,
        );

        try {
          const res = await queryPatternsForOccurrence(logsService, logGroup, queryString, occ);
          occurrenceResults.push(res);
          script.logger.text(`  -> Rilevati ${res.patterns.length} pattern.`);
        } catch (error) {
          script.logger.warning(
            `Errore durante l'esecuzione della query per l'allarme ${occ.timestamp.toISOString()}: ${(error as Error).message}`,
          );
        }
      }

      const { totalPatternsCount, frequencies } = aggregatePatternFrequencies(occurrenceResults);

      const report: AlarmOccurrencePatternReport = {
        profile,
        alarmName,
        totalOccurrences: occurrences.length,
        totalPatternsCount,
        occurrences: occurrenceResults.map((r) => ({
          occurrenceTimestamp: r.occurrence.timestamp.toISOString(),
          queryWindow: {
            start: r.occurrence.queryStartTime.toISOString(),
            end: r.occurrence.queryEndTime.toISOString(),
          },
          patternsFound: r.patterns,
        })),
        patternFrequency: frequencies,
      };

      allReports.push(report);
      printPatternReport(script, report);
    }
  }

  await exportPatternReports(script, allReports);

  script.logger.success('Analisi dei pattern completata con successo.');
}
