/**
 * Analyses mode: the comparison between runbook executions and Watchtower
 * analyses, from the target selection to the written report.
 *
 * Like the read-only modes, it reports its outcome as an exit code: anything
 * that prevents the run from happening (no connection, an unusable selection,
 * missing AWS profiles) is a failure, while a deliberate stop (cancelled
 * wizard, `--dry-run`, declined confirmation, empty period) is not.
 */
import type { Core } from '@go-automation/go-common';

import { renderPreview, renderSummary } from '../report/renderConsole.js';
import { writeReport } from '../report/writeReport.js';
import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import { allowsPrompt } from './allowsPrompt.js';
import { buildCheckContext } from './buildCheckContext.js';
import { buildRtaCheckInput } from './buildRtaCheckInput.js';
import { formatAnalysisMatcherLabel } from './resolveAnalysisMatcher.js';
import { resolveClient } from './resolveClient.js';
import type { AnalysesRunOptions } from './resolveRunOptions.js';
import { resolvePeriod } from './promptInputs.js';
import { runOccurrences } from './runOccurrences.js';
import { alarmEventsQuery, applyLimit, hasAwsProfiles, resolveFormats } from './runHelpers.js';
import { COVERAGE_EXIT_CODES } from './runCoverageCheck.js';
import type { CoverageExitCode } from './runCoverageCheck.js';
import { selectTarget } from './selectTarget.js';
import { shouldExecute } from './shouldExecute.js';

/**
 * Runs the analyses mode end to end.
 *
 * @param script - GOScript instance (logger, prompts, paths)
 * @param config - Validated script configuration
 * @param options - Mode options already validated by `resolveRunOptions`
 * @returns `0` when the run completed or was deliberately stopped, `2` when it could not run
 */
export async function runAnalysesMode(
  script: Core.GOScript,
  config: GoRtaCheckConfig,
  options: AnalysesRunOptions,
): Promise<CoverageExitCode> {
  const logger = script.logger;
  const connection = await resolveClient(script, config);
  if (connection === undefined) return COVERAGE_EXIT_CODES.NOT_EXECUTABLE;

  const allowPrompt = allowsPrompt(config, process.stdin.isTTY === true);
  // Nothing is logged here: each outcome has already reported itself, and a
  // generic message would read as a cancellation even after an error.
  const selection = await selectTarget(script, connection.client, config, allowPrompt);
  if (selection.kind === 'FAILED') return COVERAGE_EXIT_CODES.NOT_EXECUTABLE;
  if (selection.kind === 'CANCELLED') return COVERAGE_EXIT_CODES.OK;
  const { target, environment } = selection;

  const { dateFrom, dateTo } = await resolvePeriod(script, config, allowPrompt);
  logger.info('Recupero occorrenze da Watchtower …');
  const events = await connection.client.listAlarmEvents(
    alarmEventsQuery(target.alarm.id, environment.environmentIds, dateFrom, dateTo),
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
    concurrency: options.concurrency,
  });
  logger.info(`Verifica V2: ${formatAnalysisMatcherLabel(options.analysisMatcher)}`);

  const gate = { script, config, totalEvents: events.length, occurrences: occurrences.length, allowPrompt };
  if (!(await shouldExecute(gate))) return COVERAGE_EXIT_CODES.OK;
  if (!hasAwsProfiles(config.awsProfiles)) {
    logger.error('Profili AWS mancanti: passa --aws-profiles per eseguire i runbook.');
    return COVERAGE_EXIT_CODES.NOT_EXECUTABLE;
  }

  const report = await runOccurrences({
    script,
    context: buildCheckContext({
      script,
      connection,
      target,
      config,
      awsProfiles: config.awsProfiles,
      analysisMatcher: options.analysisMatcher,
    }),
    occurrences,
    reportInput: buildRtaCheckInput({
      connection,
      target,
      environment,
      dateFrom,
      dateTo,
      awsProfiles: config.awsProfiles,
      analysisMatcher: options.analysisMatcher,
    }),
    concurrency: options.concurrency,
  });
  renderSummary(logger, report);

  const files = await writeReport(script, report, resolveFormats(config.outputFormat));
  logger.section('Report');
  for (const file of files) logger.info(`Salvato: ${file}`);
  return COVERAGE_EXIT_CODES.OK;
}
