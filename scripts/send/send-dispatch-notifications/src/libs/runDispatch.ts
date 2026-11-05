/**
 * Flow of a run: preflight → shared document → validation → plan →
 * confirmation → send/verify → materialization → summary.
 */

import { Core } from '@go-automation/go-common';
import { Dispatch } from '@go-automation/go-send';

import type { ConfirmOutcome } from '../types/ConfirmOutcome.js';
import type { DispatchTarget } from '../types/DispatchTarget.js';
import type { ExecutionContext } from '../types/ExecutionContext.js';
import type { PlannedWork } from '../types/PlannedWork.js';
import type { PreparedSession } from '../types/PreparedSession.js';
import type { ResolvedRun } from '../types/ResolvedRun.js';
import type { ValidatedConfig } from '../types/ValidatedConfig.js';
import type { ConfirmFn } from '../types/ConfirmFn.js';
import { confirmRun, exitCodeForConfirmation } from './confirmRun.js';
import { createSessionOptions } from './createSessionOptions.js';
import type { DispatchShutdown } from './DispatchShutdown.js';
import { displayPlan } from './displayPlan.js';
import { displaySummary, exitCodeFor } from './displaySummary.js';
import { plannedWork } from './plannedWork.js';
import { ProgressReporter } from './ProgressReporter.js';

/** Exit code of a global error or of a blocking problem found before sending. */
const EXIT_ERROR = 1;
/** Exit code of a run with invalid or problematic rows. */
const EXIT_PROBLEMS = 2;

/**
 * Runs the dispatch for a resolved target.
 *
 * The session is attached to `shutdown` as soon as it is open, so a signal
 * during preflight, upload or validation also closes the journal; `done()`
 * is called only after `session.close()`, whatever happens. On a signal
 * GOScript exits with its own code (`128 + signal`) once `done()` is called.
 *
 * @param script - GOScript instance
 * @param config - Validated configuration
 * @param target - Resolved target
 * @param shutdown - Graceful-stop coordinator of the run
 * @returns Exit code: 0 ok, 2 completed with problems, 1 global error or
 *   blocking problem or missing production confirmation, 3 declined
 * @throws DispatchUsageError and DispatchError raised before the session
 *   opens, or by preflight/validation (logged by `main`)
 */
export async function runDispatch(
  script: Core.GOScript,
  config: ValidatedConfig,
  target: DispatchTarget,
  shutdown: DispatchShutdown,
): Promise<number> {
  const prepared = await createSessionOptions(script, config, target);
  const session = await Dispatch.DispatchSession.open(prepared.options);
  shutdown.attach(session);
  try {
    return await runSession(script, config, target, prepared, session, shutdown);
  } finally {
    try {
      await session.close();
    } finally {
      shutdown.done();
    }
  }
}

/**
 * Problem found by the validation that blocks the whole run.
 *
 * @param summary - Validation summary
 * @param failFast - `--fail-fast`
 * @returns The reason, or `undefined` when the run may proceed
 */
function blockingProblem(summary: Dispatch.ValidationSummary, failFast: boolean): string | undefined {
  if (summary.duplicateRowKeys.length > 0) return 'Chiavi di riga duplicate';
  if (summary.duplicateRequestIds.length > 0) return 'requestId duplicati (--direct-request-id-template)';
  if (failFast && summary.invalidRows > 0) return '--fail-fast: righe non valide';
  return undefined;
}

async function runSession(
  script: Core.GOScript,
  config: ValidatedConfig,
  target: DispatchTarget,
  prepared: PreparedSession,
  session: Dispatch.DispatchSession,
  shutdown: DispatchShutdown,
): Promise<number> {
  const { run, options } = prepared;
  script.logger.section('Preflight');
  if (target.externalChannels !== undefined && !options.dryRun) {
    await session.checkExternalChannels();
    script.logger.success(`pn-external-channels raggiungibile su ${target.externalChannels.baseUrl}`);
  }
  const preflight =
    target.b2b === undefined
      ? undefined
      : await session.preflight({
          basePath: target.b2b.basePath,
          production: target.production,
          ...(target.groupId !== undefined && { groupId: target.groupId }),
        });
  if (options.requestId !== undefined && !options.dryRun) {
    // Credentials of --aws-profiles are validated by GOScript at startup; this checks the table.
    await session.checkTimelines();
    script.logger.success('pn-Timelines leggibile');
  }
  const shared = await session.prepareDocuments();
  const validationStarted = Date.now();
  const summary = await session.validate();
  const validationMs = Date.now() - validationStarted;
  if (session.stopped) return stoppedBeforeSending(script, run, session, options);

  const work = plannedWork(summary, options.send);
  displayPlan(script.logger, {
    target,
    options,
    run,
    summary,
    work,
    ...(preflight !== undefined && { preflight }),
    ...(shared !== undefined && { shared }),
    ...(prepared.timelinesProfile !== undefined && { timelinesProfile: prepared.timelinesProfile }),
  });

  const blocking = blockingProblem(summary, config.failFast);
  if (blocking !== undefined) {
    await session.materialize();
    script.logger.error(`${blocking}: nessun invio. Report in ${run.runDir}`);
    return EXIT_ERROR;
  }
  if (options.dryRun) {
    await session.materialize();
    script.logger.info(dryRunMessage(run, work));
    // A dry run judges the plan: only invalid rows make it fail.
    return summary.invalidRows > 0 ? EXIT_PROBLEMS : 0;
  }
  if (work.rows === 0) {
    await session.materialize();
    script.logger.info('Nessuna riga da elaborare: nessun invio');
    // On resume rows left failed or uncertain by a previous session (no --retry-*) are still problems.
    return exitCodeFor(session.progress(), summary.totalRows);
  }
  const outcome = await confirmBeforeSending(session, async () => confirmRun(script, config, target, work));
  if (outcome !== 'CONFIRMED') {
    await session.materialize();
    script.logger.info('Nessun invio eseguito');
    return exitCodeForConfirmation(outcome);
  }
  if (session.stopped) return stoppedBeforeSending(script, run, session, options);
  return execute(script, { session, run, options, work, shutdown, totalRows: summary.totalRows, validationMs });
}

/** Outcome of a dry run: on resume it replays the previous journal, so the counts are what the resume would do. */
function dryRunMessage(run: ResolvedRun, work: PlannedWork): string {
  const what = work.sending ? `${work.rows} righe da inviare` : `${work.rows} righe da elaborare, nessun invio`;
  const kind = run.previousRun === undefined ? 'Dry run' : 'Dry run della ripresa';
  return `${kind}: ${what}. Piano e report in ${run.runDir}`;
}

/**
 * Asks for the confirmation. When it is interrupted (Ctrl-C or a signal on
 * the prompt) the output and the report of the validated rows are written
 * before the interruption reaches GOScript, like on every other early exit.
 */
async function confirmBeforeSending(session: Dispatch.DispatchSession, confirm: ConfirmFn): Promise<ConfirmOutcome> {
  try {
    return await confirm();
  } catch (error: unknown) {
    if (error instanceof Core.GOPromptInterruptedError) await session.materialize();
    throw error;
  }
}

async function stoppedBeforeSending(
  script: Core.GOScript,
  run: ResolvedRun,
  session: Dispatch.DispatchSession,
  options: Dispatch.DispatchSessionOptions,
): Promise<number> {
  // Output and report of the rows validated so far, as on every other early exit.
  await session.materialize();
  const resume = options.dryRun ? '' : `; riprendi con --resume ${run.runName} e gli stessi parametri`;
  script.logger.warning(`Run interrotto prima dell'invio: nessuna notifica inviata${resume}`);
  return EXIT_ERROR;
}

async function execute(script: Core.GOScript, context: ExecutionContext): Promise<number> {
  const { session, run, options, work, shutdown } = context;
  script.logger.section(work.sending ? 'Invio' : 'Elaborazione');
  const reporter = new ProgressReporter(script.prompt, session, work);
  reporter.start();
  const started = Date.now();
  let globalError: Dispatch.DispatchError | undefined;
  let failure: Error | undefined;
  try {
    await session.execute();
  } catch (error: unknown) {
    if (error instanceof Dispatch.DispatchError) globalError = error;
    else failure = error instanceof Error ? error : new Error(String(error), { cause: error });
  } finally {
    reporter.stop();
  }
  try {
    await session.materialize();
  } catch (error: unknown) {
    if (failure === undefined) throw error;
    script.logger.error(`Materializzazione fallita: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (failure !== undefined) throw failure;

  const progress = session.progress();
  displaySummary(script.logger, {
    progress,
    totalRows: context.totalRows,
    failures: session.failures(),
    statistics: session.sendStatistics(),
    validationMs: context.validationMs,
    executionMs: Date.now() - started,
    output: options.output,
    runDir: run.runDir,
  });
  if (globalError !== undefined) {
    script.logger.error(`Run fermato: ${globalError.code} — ${globalError.message}`);
    return EXIT_ERROR;
  }
  if (session.requestIdCredentialsExpired) {
    script.logger.warning(
      `Credenziali AWS scadute durante l'attesa del requestId: esegui aws sso login, poi --resume ${run.runName} con gli stessi parametri`,
    );
    return EXIT_PROBLEMS;
  }
  if (shutdown.wasInterrupted) {
    // GOScript exits with 128 + signal (130 for Ctrl-C) once the cleanup hook returns.
    script.logger.warning(`Run interrotto: riprendi con --resume ${run.runName} e gli stessi parametri`);
  }
  return exitCodeFor(progress, context.totalRows);
}
