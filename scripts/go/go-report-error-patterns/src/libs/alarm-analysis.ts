/**
 * Analysis of a single alarm configuration: alarm history lookup, pattern queries per occurrence,
 * optional static-token resolution and report generation, for every AWS profile of the alarm.
 */

import type { GOScript } from '@go-automation/go-script';
import { AWSAccountProfileSet } from '@pagopa/go-aws';
import { AWSCloudWatchAlarmsService } from '@pagopa/go-aws/cloudwatch-alarms';
import { AWSCloudWatchLogsService } from '@pagopa/go-aws/cloudwatch-logs';
import { getErrorMessage } from '@pagopa/go-common/errors';
import { GOJSONFileImporter } from '@pagopa/go-common/importers';
import type { AlarmOccurrence, AlarmPatternConfigFile, OccurrenceQueryResult } from '../types/index.js';
import { extractAlarmOccurrenceWindow, parseDateInput } from './alarm-evaluator.js';
import { applyPatternResolutions, queryPatternsForOccurrence, resolvePatternTokens } from './pattern-analyzer.js';
import { buildAllReports, printAllReports } from './report.js';
import type { GeneratedReports } from './report.js';

/**
 * Loads the alarm configuration file, accepting either a single entry or an array of entries.
 *
 * @param configFile - Path to the JSON configuration file
 * @returns The alarm configuration entries
 */
export async function loadAlarmConfigs(configFile: string): Promise<ReadonlyArray<AlarmPatternConfigFile>> {
  const importer = new GOJSONFileImporter<AlarmPatternConfigFile | AlarmPatternConfigFile[]>({
    inputPath: configFile,
  });
  const raw = await importer.import();
  if (raw === undefined) {
    throw new Error(`File di configurazione vuoto: "${configFile}"`);
  }
  return Array.isArray(raw) ? raw : [raw];
}

/**
 * Resolves the AWS profiles for an alarm: the `profile` of the entry wins over `--aws-profiles`.
 *
 * @param item - Alarm configuration entry
 * @param awsProfiles - Profiles passed with `--aws-profiles`
 * @returns The profiles to analyze
 * @throws Error when no profile is available
 */
export function resolveProfiles(
  item: AlarmPatternConfigFile,
  awsProfiles: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> {
  if (item.profile) {
    return [item.profile];
  }
  if (awsProfiles !== undefined && awsProfiles.length > 0) {
    return awsProfiles;
  }
  throw new Error(
    `Nessun profilo AWS specificato per l'allarme "${item.alarmName}". Specificare il campo "profile" nel file di configurazione oppure il parametro "--aws-profiles".`,
  );
}

/**
 * Analyzes one alarm configuration on every resolved AWS profile.
 *
 * @param script - The GOScript instance for logging and AWS clients
 * @param item - Alarm configuration entry
 * @param awsProfiles - Profiles passed with `--aws-profiles`
 * @returns The reports generated for each profile
 */
export async function analyzeAlarm(
  script: GOScript,
  item: AlarmPatternConfigFile,
  awsProfiles: ReadonlyArray<string> | undefined,
): Promise<ReadonlyArray<GeneratedReports>> {
  const startDate = parseDateInput(item.alarmHistoryStartDate);
  const endDate = parseDateInput(item.alarmHistoryEndDate);

  script.logger.info(`Analisi configurazione per allarme: "${item.alarmName}"`);
  script.logger.info(`Intervallo ricerca allarme: ${startDate.toISOString()} -> ${endDate.toISOString()}`);
  script.logger.info(`Log Group: ${item.logGroup}`);

  const reports: GeneratedReports[] = [];
  for (const profile of resolveProfiles(item, awsProfiles)) {
    reports.push(await analyzeAlarmOnProfile(script, item, profile, { start: startDate, end: endDate }));
  }
  return reports;
}

async function analyzeAlarmOnProfile(
  script: GOScript,
  item: AlarmPatternConfigFile,
  profile: string,
  timeRange: { readonly start: Date; readonly end: Date },
): Promise<GeneratedReports> {
  const alarmName = item.alarmName;
  script.logger.section(`Esecuzione su profilo AWS: ${profile}`);

  const alarmsService = new AWSCloudWatchAlarmsService(script.aws.clients.get(profile).cloudWatch);
  const logsService = new AWSCloudWatchLogsService(new AWSAccountProfileSet(script.aws.clients, [profile]));

  script.logger.info(`Recupero transizioni di stato dell'allarme "${alarmName}"...`);
  const transitions = await alarmsService.describeAlarmStateTransitions({ alarmName, timeRange });
  script.logger.info(`Trovate ${transitions.length} transizioni verso ALARM.`);

  const extraSeconds = item.timeWindowExtraSeconds ?? item.bufferSeconds ?? 0;
  const occurrences = transitions
    .map((transition) => extractAlarmOccurrenceWindow(transition, extraSeconds))
    .filter((occurrence): occurrence is AlarmOccurrence => occurrence !== undefined);

  const queried = await queryOccurrences(script, logsService, item, occurrences);
  const occurrenceResults =
    item.resolveStaticTokens === true
      ? await resolveStaticTokens(script, logsService, item.logGroup, queried)
      : queried;

  const generatedReports = buildAllReports(profile, alarmName, occurrenceResults);
  printAllReports(script, generatedReports);
  return generatedReports;
}

async function queryOccurrences(
  script: GOScript,
  logsService: AWSCloudWatchLogsService,
  item: AlarmPatternConfigFile,
  occurrences: ReadonlyArray<AlarmOccurrence>,
): Promise<OccurrenceQueryResult[]> {
  const results: OccurrenceQueryResult[] = [];
  for (const [index, occ] of occurrences.entries()) {
    script.logger.info(
      `[${index + 1}/${occurrences.length}] Esecuzione query pattern per allarme delle ${occ.timestamp.toISOString()} (finestra: ${occ.queryStartTime.toISOString()} -> ${occ.queryEndTime.toISOString()})...`,
    );
    try {
      const res = await queryPatternsForOccurrence(logsService, item.logGroup, item.queryAwsCloudWatch, occ);
      results.push(res);
      script.logger.text(`  -> Rilevati ${res.patterns.length} pattern.`);
    } catch (error: unknown) {
      script.logger.warning(
        `Errore durante l'esecuzione della query per l'allarme ${occ.timestamp.toISOString()}: ${getErrorMessage(error)}`,
      );
    }
  }
  return results;
}

async function resolveStaticTokens(
  script: GOScript,
  logsService: AWSCloudWatchLogsService,
  logGroup: string,
  occurrenceResults: OccurrenceQueryResult[],
): Promise<OccurrenceQueryResult[]> {
  script.logger.info('Risoluzione token statici nei pattern...');

  const patternWindowsMap = new Map<string, { start: Date; end: Date }[]>();
  for (const res of occurrenceResults) {
    for (const p of res.patterns) {
      const windows = patternWindowsMap.get(p.pattern) ?? [];
      windows.push({ start: res.occurrence.queryStartTime, end: res.occurrence.queryEndTime });
      patternWindowsMap.set(p.pattern, windows);
    }
  }

  const resolutionMap = new Map<string, string>();
  for (const [pattern, windows] of patternWindowsMap) {
    const resolved = await resolvePatternTokens(logsService, logGroup, pattern, windows);
    if (resolved !== pattern) {
      resolutionMap.set(pattern, resolved);
      script.logger.text(`  Pattern risolto: "${pattern}" → "${resolved}"`);
    }
  }

  return resolutionMap.size > 0 ? applyPatternResolutions(occurrenceResults, resolutionMap) : occurrenceResults;
}
