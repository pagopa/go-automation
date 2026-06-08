/**
 * Go RTA Check - Main orchestration.
 *
 * Flow: login Watchtower → resolve product/alarm/period → fetch occurrences →
 * (per occurrence) run runbook in-process → classify V1 → compare V2 with the
 * analysis → report (console + JSON/HTML). Step logic lives under `libs/`.
 */
import { Core } from '@go-automation/go-common';
import { createServiceRegistry } from 'go-analyze-alarm/api';

import type { GoRtaCheckConfig } from './types/GoRtaCheckConfig.js';
import type { AlarmAnalysisDto } from './types/WatchtowerDtos.js';
import { buildReport } from './report/buildReport.js';
import { renderPreview, renderSummary } from './report/renderConsole.js';
import { writeReport } from './report/writeReport.js';
import type { CheckContext } from './libs/checkOccurrence.js';
import { resolveClient } from './libs/resolveClient.js';
import { resolveProductAlarm } from './libs/resolveProductAlarm.js';
import { resolveEnvironment } from './libs/resolveEnvironment.js';
import { runOccurrences } from './libs/runOccurrences.js';
import { confirmRun, resolvePeriod } from './libs/promptInputs.js';
import { alarmEventsQuery, applyLimit, resolveFormats } from './libs/runHelpers.js';
import { resolveRunbookCacheDescriptor } from './runner/runbookFingerprint.js';

/**
 * Script entry: resolves inputs, runs the comparison over every occurrence and
 * writes the report.
 *
 * @param script - The GOScript instance
 */
export async function main(script: Core.GOScript): Promise<void> {
  const config = await script.getConfiguration<GoRtaCheckConfig>();
  const logger = script.logger;
  logger.section('Go RTA Check');

  const connection = await resolveClient(script, config);
  if (connection === undefined) return;
  const target = await resolveProductAlarm(script, connection.client, config);
  if (target === undefined) return;
  const flagDriven = config.alarmName !== undefined && config.dateFrom !== undefined;
  const environment = await resolveEnvironment(script, connection.client, target.productId, config, !flagDriven);

  const { dateFrom, dateTo } = await resolvePeriod(script, config);
  logger.info('Recupero occorrenze da Watchtower …');
  const events = await connection.client.listAlarmEvents(
    alarmEventsQuery(target.alarm.id, environment.environmentId, dateFrom, dateTo),
  );
  const occurrences = applyLimit(events, config.limit);

  renderPreview(logger, {
    productName: target.productName,
    environmentName: environment.environmentName,
    alarmName: target.alarmName,
    dateFrom: dateFrom === '' ? '(inizio)' : dateFrom,
    dateTo: dateTo === '' ? '(fine)' : dateTo,
    totalOccurrences: events.length,
    linkedAnalyses: events.filter((event) => event.analysisId !== null).length,
    concurrency: config.concurrency ?? 1,
  });

  if (events.length === 0) {
    logger.warning('Nessuna occorrenza nel periodo selezionato.');
    return;
  }
  if (config.dryRun === true) {
    logger.success('Dry-run: nessuna esecuzione runbook. Fine.');
    return;
  }
  if (!(await confirmRun(script, config, occurrences.length))) {
    logger.warning('Operazione annullata.');
    return;
  }
  if (config.awsProfiles === undefined || config.awsProfiles.length === 0) {
    logger.error('Profili AWS mancanti: passa --aws-profiles per eseguire i runbook.');
    return;
  }

  const context: CheckContext = {
    services: createServiceRegistry(script),
    engineLogger: new Core.GOLogger(),
    client: connection.client,
    script: script,
    productId: target.productId,
    productName: target.productName,
    alarmName: target.alarmName,
    runbook: resolveRunbookCacheDescriptor(target.alarmName),
    awsProfiles: config.awsProfiles,
    analysisCache: new Map<string, AlarmAnalysisDto | undefined>(),
    matchOptions: {
      includeIgnorable: config.includeIgnorable === true,
      includeIncomplete: config.includeIncomplete === true,
    },
    force: config.force === true,
  };

  const rows = await runOccurrences(context, occurrences, script);

  const report = buildReport(
    {
      watchtowerUrl: connection.baseUrl,
      productId: target.productId,
      productName: target.productName,
      environmentName: environment.environmentName,
      alarmId: target.alarm.id,
      alarmName: target.alarmName,
      dateFrom,
      dateTo,
      awsProfiles: [...config.awsProfiles],
    },
    rows,
  );
  renderSummary(logger, report);

  const files = await writeReport(script, report, resolveFormats(config.outputFormat));
  logger.section('Report');
  for (const file of files) logger.info(`Salvato: ${file}`);
}
