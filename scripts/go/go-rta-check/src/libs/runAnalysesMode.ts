/**
 * Analyses mode: the comparison between runbook executions and Watchtower
 * analyses, from the target selection to the written report.
 *
 * Interactively it is a session, not a single command: once a runbook has been
 * analysed the user is offered another one, reusing the Watchtower login and
 * the reads already paid for. Unattended it stays a one-shot run, because a
 * continuation menu nobody can answer would hang the process.
 *
 * Like the read-only modes, it reports its outcome as an exit code: anything
 * that prevents a run from happening (no connection, an unusable selection,
 * missing AWS profiles) is a failure, while a deliberate stop (cancelled
 * wizard, `--dry-run`, declined confirmation, empty period) is not. Over a
 * session the worst outcome wins, so a failed run never hides behind a later
 * successful one.
 */
import type { Core } from '@go-automation/go-common';

import { renderPreview, renderSummary } from '../report/renderConsole.js';
import { reportSubdirectory, writeReport } from '../report/writeReport.js';
import type { GoRtaCheckConfig } from '../types/GoRtaCheckConfig.js';
import { allowsPrompt } from './allowsPrompt.js';
import { buildCheckContext } from './buildCheckContext.js';
import { buildRtaCheckInput } from './buildRtaCheckInput.js';
import { promptNextRun } from './promptNextRun.js';
import { formatAnalysisMatcherLabel } from './resolveAnalysisMatcher.js';
import { resolveClient } from './resolveClient.js';
import type { Connection } from './resolveClient.js';
import type { AnalysesRunOptions } from './resolveRunOptions.js';
import { resolvePeriod } from './promptInputs.js';
import { runOccurrences } from './runOccurrences.js';
import { alarmEventsQuery, applyLimit, hasAwsProfiles, resolveFormats } from './runHelpers.js';
import { COVERAGE_EXIT_CODES } from './runCoverageCheck.js';
import type { CoverageExitCode } from './runCoverageCheck.js';
import { createTargetWizardSession, selectTarget } from './selectTarget.js';
import type { SelectedTarget, TargetWizardResume } from './selectTarget.js';
import { shouldExecute } from './shouldExecute.js';

/**
 * Runs the analyses mode end to end, looping over as many runbooks as the user asks for.
 *
 * @param script - GOScript instance (logger, prompts, paths)
 * @param config - Validated script configuration
 * @param options - Mode options already validated by `resolveRunOptions`
 * @returns `0` when every run completed or was deliberately stopped, `2` when one could not run
 */
export async function runAnalysesMode(
  script: Core.GOScript,
  config: GoRtaCheckConfig,
  options: AnalysesRunOptions,
): Promise<CoverageExitCode> {
  const connection = await resolveClient(script, config);
  if (connection === undefined) return COVERAGE_EXIT_CODES.NOT_EXECUTABLE;

  const allowPrompt = allowsPrompt(config, process.stdin.isTTY === true);
  const session = createTargetWizardSession(connection.client);
  const mayLoop = allowPrompt && !isAlarmPinned(config);

  let exitCode: CoverageExitCode = COVERAGE_EXIT_CODES.OK;
  let resume: TargetWizardResume | undefined;
  let runIndex = 0;

  for (;;) {
    // Nothing is logged here: each outcome has already reported itself, and a
    // generic message would read as a cancellation even after an error.
    const selection = await selectTarget(script, connection.client, config, allowPrompt, {
      session,
      ...(resume !== undefined ? { resume } : {}),
    });
    if (selection.kind === 'FAILED') return worstExitCode(exitCode, COVERAGE_EXIT_CODES.NOT_EXECUTABLE);
    if (selection.kind === 'CANCELLED') return exitCode;

    runIndex += 1;
    const outcome = await runSingleAnalysis({
      script,
      config,
      options,
      connection,
      selection,
      allowPrompt,
      runIndex,
    });
    exitCode = worstExitCode(exitCode, outcome.exitCode);

    if (!mayLoop || !outcome.canContinue) return exitCode;
    const next = await promptNextRun({
      script,
      productName: selection.target.productName,
      canChangeProduct: selection.resume.productInteractive,
    });
    if (next === 'EXIT') return exitCode;
    resume = next === 'SAME_PRODUCT' ? selection.resume : undefined;
  }
}

/** Inputs of a single runbook analysis. */
interface SingleAnalysisOptions {
  readonly script: Core.GOScript;
  readonly config: GoRtaCheckConfig;
  readonly options: AnalysesRunOptions;
  readonly connection: Connection;
  readonly selection: SelectedTarget;
  readonly allowPrompt: boolean;
  /** 1-based position in the session, used to keep the artifacts apart. */
  readonly runIndex: number;
}

/** Outcome of one analysis: its exit code, and whether the session may go on. */
interface SingleAnalysisOutcome {
  readonly exitCode: CoverageExitCode;
  /**
   * `false` only for a missing prerequisite of the whole session (no AWS
   * profiles): another run would fail exactly the same way, so insisting would
   * only make the user answer the menu again for nothing.
   */
  readonly canContinue: boolean;
}

/**
 * Analyses one runbook: occurrences, preview, execution gate, run and report.
 *
 * @param params - Selection to analyse plus the session-wide context
 * @returns The exit code of this run and whether the session may continue
 */
async function runSingleAnalysis(params: SingleAnalysisOptions): Promise<SingleAnalysisOutcome> {
  const { script, config, options, connection, selection, allowPrompt } = params;
  const logger = script.logger;
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
  if (!(await shouldExecute(gate))) return { exitCode: COVERAGE_EXIT_CODES.OK, canContinue: true };
  if (!hasAwsProfiles(config.awsProfiles)) {
    logger.error('Profili AWS mancanti: passa --aws-profiles per eseguire i runbook.');
    return { exitCode: COVERAGE_EXIT_CODES.NOT_EXECUTABLE, canContinue: false };
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

  const files = await writeReport(
    script,
    report,
    resolveFormats(config.outputFormat),
    reportSubdirectory(params.runIndex, target.alarmName),
  );
  logger.section('Report');
  for (const file of files) logger.info(`Salvato: ${file}`);
  return { exitCode: COVERAGE_EXIT_CODES.OK, canContinue: true };
}

/**
 * Keeps the most severe outcome of the session.
 *
 * @param left - Exit code accumulated so far
 * @param right - Exit code of the run that just ended
 * @returns The higher of the two, the codes being ordered by severity
 */
function worstExitCode(left: CoverageExitCode, right: CoverageExitCode): CoverageExitCode {
  return right > left ? right : left;
}

/** A runbook pinned by flag makes every further run identical: the session ends after the first. */
function isAlarmPinned(config: GoRtaCheckConfig): boolean {
  return config.alarmName !== undefined && config.alarmName !== '';
}
