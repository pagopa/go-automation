/**
 * `enable` / `disable` actions: drives the five phases of the sweep.
 *
 * read (fan-out) -> plan (pure) -> preview -> gate -> apply (fan-out) ->
 * verdict (pure) -> render -> throw?
 *
 * Living in `libs/` is what keeps `enable` and `disable` one-liners in the
 * switch of `main.ts`.
 */

import type { AWS, Core } from '@go-automation/go-common';

import type { AwsScheduleEventbridgeConfig, ScheduleMutation, ScheduleSweepVerdict } from '../types/index.js';
import { applyScheduleSweep } from './applyScheduleSweep.js';
import { buildSweepVerdict } from './buildSweepVerdict.js';
import { confirmScheduleSweep } from './confirmScheduleSweep.js';
import { planScheduleSweep } from './planScheduleSweep.js';
import { readSchedules } from './readSchedules.js';
import { displaySweepPlan, displaySweepResult } from './sweepDisplay.js';

/** One line the operator can read without counting table rows. */
function formatVerdict(verdict: ScheduleSweepVerdict): string {
  return (
    `${verdict.changed} changed, ${verdict.unchanged} unchanged, ${verdict.pending} pending, ` +
    `${verdict.missing} missing, ${verdict.failed} failed of ${verdict.profileCount} account(s).`
  );
}

/**
 * Sets one schedule to the requested state across every configured account.
 *
 * Throws when the fleet did not converge, so a partial failure is visible to a
 * caller that only looks at the exit code. A cancelled run returns before the
 * verdict: the operator stopped on purpose, and any read error was printed
 * already, so there is nothing left to signal.
 *
 * @param script - The GOScript instance providing AWS clients, logger and prompt
 * @param config - Validated script configuration, with `scheduleName` already checked
 * @param targetState - State every account must end up in
 * @throws When any account failed, or an account is missing the schedule under `--fail-on-missing`
 */
export async function runScheduleSweep(
  script: Core.GOScript,
  config: AwsScheduleEventbridgeConfig,
  targetState: AWS.ScheduleState,
): Promise<void> {
  const reads = await readSchedules(script, config);
  const plan = planScheduleSweep(reads, targetState);

  displaySweepPlan(script, plan);

  const gate = await confirmScheduleSweep(script, config, plan);
  if (gate === 'cancelled') {
    script.logger.warning('Operation cancelled by user.');
    return;
  }

  let mutations: ReadonlyArray<ScheduleMutation> = [];
  if (gate === 'proceed') {
    mutations = await applyScheduleSweep(script, config, plan);
    displaySweepResult(script, mutations);
  }

  const verdict = buildSweepVerdict(plan, mutations, config.failOnMissing);
  const summary = formatVerdict(verdict);

  if (!verdict.converged) {
    script.logger.error(summary);
    throw new Error(
      `Schedule sweep did not converge: ${verdict.failed} account(s) failed, ` +
        `${verdict.missing} missing. Re-run to retry, the sweep is idempotent.`,
    );
  }

  script.logger.success(summary);
}
