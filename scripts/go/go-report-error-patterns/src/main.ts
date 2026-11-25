/**
 * Go Report Error Patterns - Main Logic Module
 *
 * Implements CloudWatch alarm history querying, automatic evaluation datapoint time-window
 * extraction, pattern analysis execution and frequency reporting across modular reports.
 */

import { GOScript } from '@go-automation/go-script';
import { AWSAccountProfileSet } from '@pagopa/go-aws';
import { AWSCloudWatchAlarmsService } from '@pagopa/go-aws/cloudwatch-alarms';
import { AWSCloudWatchLogsService } from '@pagopa/go-aws/cloudwatch-logs';
import { GOJSONFileImporter } from '@pagopa/go-common/importers';
import type {
  GoReportErrorPatternsConfig,
  AlarmPatternConfigFile,
  AlarmOccurrence,
  DominantPatternReport,
  PatternCoverageReport,
  TiedPatternCombinationsReport,
  OccurrenceQueryResult,
} from './types/index.js';
import { parseDateInput, extractAlarmOccurrenceWindow } from './libs/alarm-evaluator.js';
import { queryPatternsForOccurrence, resolvePatternTokens, applyPatternResolutions } from './libs/pattern-analyzer.js';
import { buildAllReports, printAllReports, exportAllReports } from './libs/report.js';

/**
 * Main script execution function
 *
 * @param script - The GOScript instance for logging and prompts
 */
export async function main(script: GOScript): Promise<void> {
  script.logger.section('Starting Go Report Error Patterns');

  const config = await script.getConfiguration<GoReportErrorPatternsConfig>();

  const configFileImporter = new GOJSONFileImporter({
    inputPath: config.configFile,
  });
  const rawConfigFile = await configFileImporter.import();
  const configFiles: AlarmPatternConfigFile[] = Array.isArray(rawConfigFile)
    ? (rawConfigFile as AlarmPatternConfigFile[])
    : [rawConfigFile as AlarmPatternConfigFile];

  const allDominantReports: DominantPatternReport[] = [];
  const allCoverageReports: PatternCoverageReport[] = [];
  const allTiedReports: TiedPatternCombinationsReport[] = [];

  for (const item of configFiles) {
    const alarmName = item['alarm-name'];
    const logGroup = item['log-group'];
    const queryString = item['query-aws-cloudwatch'];
    const extraSeconds = item['time-window-extra-seconds'] ?? item['buffer-seconds'] ?? 0;

    const startDate = parseDateInput(item['alarm-history-start-date']);
    const endDate = parseDateInput(item['alarm-history-end-date']);

    script.logger.info(`Analisi configurazione per allarme: "${alarmName}"`);
    script.logger.info(`Intervallo ricerca allarme: ${startDate.toISOString()} -> ${endDate.toISOString()}`);
    script.logger.info(`Log Group: ${logGroup}`);

    const profilesToUse = item['profile']
      ? [item['profile']]
      : config.awsProfiles && config.awsProfiles.length > 0
        ? config.awsProfiles
        : [];

    if (profilesToUse.length === 0) {
      throw new Error(
        `Nessun profilo AWS specificato per l'allarme "${alarmName}". Specificare il campo "profile" nel file di configurazione oppure il parametro "--aws-profiles".`,
      );
    }

    for (const profile of profilesToUse) {
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
        const occ = extractAlarmOccurrenceWindow(t, extraSeconds);
        if (occ) {
          occurrences.push(occ);
        }
      }

      let occurrenceResults: OccurrenceQueryResult[] = [];

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

      if (item['resolve-static-tokens'] === true) {
        script.logger.info('Risoluzione token statici nei pattern...');

        // Raccoglie pattern distinti e le finestre in cui sono apparsi
        const patternWindowsMap = new Map<string, { start: Date; end: Date }[]>();
        for (const res of occurrenceResults) {
          for (const p of res.patterns) {
            const windows = patternWindowsMap.get(p.pattern) ?? [];
            windows.push({ start: res.occurrence.queryStartTime, end: res.occurrence.queryEndTime });
            patternWindowsMap.set(p.pattern, windows);
          }
        }

        // Risolve ogni pattern distinto
        const resolutionMap = new Map<string, string>();
        for (const [pattern, windows] of patternWindowsMap) {
          const resolved = await resolvePatternTokens(logsService, logGroup, pattern, windows);
          if (resolved !== pattern) {
            resolutionMap.set(pattern, resolved);
            script.logger.text(`  Pattern risolto: "${pattern}" → "${resolved}"`);
          }
        }

        // Applica le risoluzioni agli occurrenceResults
        if (resolutionMap.size > 0) {
          occurrenceResults = applyPatternResolutions(occurrenceResults, resolutionMap);
        }
      }

      const generatedReports = buildAllReports(profile, alarmName, occurrenceResults);
      printAllReports(script, generatedReports);

      allDominantReports.push(generatedReports.dominantReport);
      allCoverageReports.push(generatedReports.patternCoverageReport);
      allTiedReports.push(generatedReports.tiedCombinationsReport);
    }
  }

  await exportAllReports(script, {
    dominantReports: allDominantReports,
    patternCoverageReports: allCoverageReports,
    tiedCombinationsReports: allTiedReports,
  });

  script.logger.success('Analisi dei pattern completata con successo.');
}
