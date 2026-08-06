/**
 * Go RTA Check - Main orchestration.
 *
 * Two modes, selected by the `mode` parameter:
 * - `analyses` (default): login Watchtower → resolve product/alarm/period → fetch
 *   occurrences → (per occurrence) run runbook in-process → classify V1 → compare
 *   V2 with the analysis → report (console + JSON/HTML);
 * - `coverage`: login Watchtower → load the census → compare it with the runbook
 *   declarations → coverage report.
 *
 * Step logic lives under `libs/`.
 */
import { Core } from '@go-automation/go-common';

import type { GoRtaCheckConfig } from './types/GoRtaCheckConfig.js';
import { renderPreview, renderSummary } from './report/renderConsole.js';
import { writeReport } from './report/writeReport.js';
import { resolveClient } from './libs/resolveClient.js';
import { resolveProductAlarm } from './libs/resolveProductAlarm.js';
import { resolveEnvironment } from './libs/resolveEnvironment.js';
import { formatAnalysisMatcherLabel } from './libs/resolveAnalysisMatcher.js';
import { buildCheckContext } from './libs/buildCheckContext.js';
import { buildRtaCheckInput } from './libs/buildRtaCheckInput.js';
import { runOccurrences } from './libs/runOccurrences.js';
import { runCoverageMode } from './libs/runCoverageMode.js';
import { resolveRunOptions } from './libs/resolveRunOptions.js';

import { confirmRun, resolvePeriod } from './libs/promptInputs.js';
import { alarmEventsQuery, applyLimit, hasAwsProfiles, resolveFormats } from './libs/runHelpers.js';

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
  const options = resolveRunOptions(logger, config);
  if (options === undefined) return;

  if (options.mode === 'coverage') {
    process.exitCode = await runCoverageMode(script, config);
    return;
  }

  const { analysisMatcher, concurrency } = options;
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
    concurrency,
  });
  logger.info(`Verifica V2: ${formatAnalysisMatcherLabel(analysisMatcher)}`);

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
  if (!hasAwsProfiles(config.awsProfiles)) {
    logger.error('Profili AWS mancanti: passa --aws-profiles per eseguire i runbook.');
    return;
  }

  const context = buildCheckContext({
    script,
    connection,
    target,
    config,
    awsProfiles: config.awsProfiles,
    analysisMatcher,
  });
  const report = await runOccurrences({
    script,
    context,
    occurrences,
    reportInput: buildRtaCheckInput({
      connection,
      target,
      environment,
      dateFrom,
      dateTo,
      awsProfiles: config.awsProfiles,
      analysisMatcher,
    }),
    concurrency,
  });
  renderSummary(logger, report);

  const files = await writeReport(script, report, resolveFormats(config.outputFormat));
  logger.section('Report');
  for (const file of files) logger.info(`Salvato: ${file}`);
}
