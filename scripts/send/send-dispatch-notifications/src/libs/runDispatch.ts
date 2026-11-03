/**
 * Flow of a run: preflight → shared document → validation → plan →
 * confirmation → send/verify → materialization → summary.
 */

import type { Core } from '@go-automation/go-common';
import { Dispatch } from '@go-automation/go-send';

import type { DispatchTarget } from '../types/DispatchTarget.js';
import type { ExecutionContext } from '../types/ExecutionContext.js';
import type { SendDispatchNotificationsConfig } from '../types/SendDispatchNotificationsConfig.js';
import { confirmRun } from './confirmRun.js';
import { createSessionOptions, timelinesProfile } from './createSessionOptions.js';
import type { DispatchShutdown } from './DispatchShutdown.js';
import { displayPlan } from './displayPlan.js';
import { displaySummary, exitCodeFor } from './displaySummary.js';
import { ProgressReporter } from './ProgressReporter.js';

/** Exit code of an interrupted run (§15). */
const EXIT_INTERRUPTED = 130;

/**
 * Runs the dispatch for a resolved target.
 *
 * @param script - GOScript instance
 * @param config - Script configuration
 * @param target - Resolved target
 * @param shutdown - Graceful-stop coordinator of the run
 * @returns Exit code: 0 ok, 2 completed with problems, 1 global error, 130 interrupted
 */
export async function runDispatch(
  script: Core.GOScript,
  config: SendDispatchNotificationsConfig,
  target: DispatchTarget,
  shutdown: DispatchShutdown,
): Promise<number> {
  const { run, options } = await createSessionOptions(script, config, target);
  const session = await Dispatch.DispatchSession.open(options);
  try {
    script.logger.section('Preflight');
    const usesB2B = options.mode !== 'direct' && (options.send || options.verify);
    if (options.mode === 'direct' && !options.dryRun) {
      await session.checkExternalChannels();
      script.logger.success(`pn-external-channels raggiungibile su ${target.basePath}`);
    }
    const preflight = usesB2B
      ? await session.preflight({
          basePath: target.basePath,
          production: target.production,
          ...(target.groupId !== undefined && { groupId: target.groupId }),
        })
      : undefined;
    if (options.requestId !== undefined && !options.dryRun) {
      // Credentials of --aws-profiles are validated by GOScript at startup; this checks the table.
      await session.checkTimelines();
      script.logger.success('pn-Timelines leggibile');
    }
    const shared = await session.prepareDocuments();
    const validationStarted = Date.now();
    const summary = await session.validate();
    const validationMs = Date.now() - validationStarted;
    const awsProfile = options.requestId === undefined ? undefined : timelinesProfile(config, target);
    displayPlan(script.logger, {
      target,
      options,
      run,
      preflight,
      shared,
      summary,
      ...(awsProfile !== undefined && { timelinesProfile: awsProfile }),
    });

    if (summary.duplicateRowKeys.length > 0) throw new Error('Duplicate row keys: nothing was sent');
    if (summary.duplicateRequestIds.length > 0) throw new Error('Duplicate direct requestIds: nothing was sent');
    if (config.failFast && summary.invalidRows > 0)
      throw new Error('--fail-fast: invalid rows found, nothing was sent');
    if (options.dryRun || summary.validRows === 0 || !(await confirmRun(script, config, target, summary))) {
      await session.materialize();
      script.logger.info(options.dryRun ? `Dry run: piano e report in ${run.runDir}` : 'Nessun invio eseguito');
      return summary.invalidRows > 0 ? 2 : 0;
    }

    return await execute(script, { session, run, options, summary, shutdown, validationMs });
  } finally {
    await session.close();
  }
}

async function execute(script: Core.GOScript, context: ExecutionContext): Promise<number> {
  const { session, run, options, summary, shutdown } = context;
  script.logger.section('Invio');
  const reporter = new ProgressReporter(script.prompt, session, summary.validRows);
  shutdown.attach(session);
  reporter.start();
  const started = Date.now();
  let globalError: Dispatch.DispatchError | undefined;
  try {
    await session.execute();
  } catch (error: unknown) {
    if (!(error instanceof Dispatch.DispatchError)) throw error;
    globalError = error;
  } finally {
    reporter.stop();
    await session.materialize();
    shutdown.done();
  }

  const progress = session.progress();
  displaySummary(script.logger, {
    progress,
    failures: session.failures(),
    statistics: session.sendStatistics(),
    validationMs: context.validationMs,
    executionMs: Date.now() - started,
    output: options.output,
    runDir: run.runDir,
  });
  if (globalError !== undefined) {
    script.logger.error(`Run fermato: ${globalError.code} — ${globalError.message}`);
    return 1;
  }
  if (session.requestIdCredentialsExpired) {
    script.logger.warning(
      `Credenziali AWS scadute durante l'attesa del requestId: esegui aws sso login, poi --resume ${run.runName}`,
    );
    return 2;
  }
  if (shutdown.wasInterrupted) {
    script.logger.warning(`Run interrotto: riprendi con --resume ${run.runName}`);
    return EXIT_INTERRUPTED;
  }
  return exitCodeFor(progress);
}
