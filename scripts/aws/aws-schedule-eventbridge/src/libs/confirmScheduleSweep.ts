/**
 * Phase 3 of the sweep: the single gate between the preview and the writes.
 */

import type { Core } from '@go-automation/go-common';

import type { AwsScheduleEventbridgeConfig, ScheduleSweepGate, ScheduleSweepPlan } from '../types/index.js';

/** Counts the entries carrying one planned action. */
function countAction(plan: ScheduleSweepPlan, action: 'missing' | 'error'): number {
  return plan.entries.filter((entry) => entry.action === action).length;
}

/**
 * Builds the one-line question, naming the cardinality and the accounts.
 *
 * The operator has to be able to approve or refuse from the prompt alone, so it
 * repeats what the preview table showed rather than assuming it was read.
 */
function buildConfirmMessage(scheduleName: string, plan: ScheduleSweepPlan): string {
  const profiles = plan.changeNeeded.map((entry) => entry.profile).join(', ');
  const parts = [
    `Set schedule "${scheduleName}" to ${plan.targetState} in ${plan.changeNeeded.length} of ` +
      `${plan.profileCount} account(s) [${profiles}]?`,
  ];

  const missing = countAction(plan, 'missing');
  if (missing > 0) {
    parts.push(`${missing} account(s) do not have it.`);
  }

  const failed = countAction(plan, 'error');
  if (failed > 0) {
    parts.push(`${failed} account(s) could not be read.`);
  }

  return parts.join(' ');
}

/**
 * Decides whether the write phase runs, and says why when it does not.
 *
 * A single confirmation covers the whole batch: asking once per account would
 * train the operator to hold down `y`.
 *
 * A `--dry-run` check belongs between the no-op case and the prompt, so the
 * flag is usable from CI without ever blocking on a question. It is absent
 * because go-common does not expose `isDryRun` on this base yet.
 *
 * @param script - The GOScript instance providing the logger and the prompt
 * @param config - Validated script configuration
 * @param plan - The plan produced by `planScheduleSweep`
 * @returns Which of the three gate states the run is in
 */
export async function confirmScheduleSweep(
  script: Core.GOScript,
  config: AwsScheduleEventbridgeConfig,
  plan: ScheduleSweepPlan,
): Promise<ScheduleSweepGate> {
  const scheduleName = config.scheduleName ?? '-';

  if (plan.changeNeeded.length === 0) {
    script.logger.info(`No account needs a change: nothing readable is outside ${plan.targetState}.`);
    return 'nothing-to-do';
  }

  if (config.yes) {
    return 'proceed';
  }

  // `confirm` resolves to undefined when the prompt is cancelled (e.g. Ctrl+C),
  // which must be treated as a refusal just like an explicit "no".
  const confirmed = await script.prompt.confirm(buildConfirmMessage(scheduleName, plan), false);

  return confirmed === true ? 'proceed' : 'cancelled';
}
