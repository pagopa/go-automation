/**
 * Phase 4 of the sweep: writes the planned state to the accounts that need it.
 */

import { AWS, type Core } from '@go-automation/go-common';

import type { AwsScheduleEventbridgeConfig, ScheduleMutation, ScheduleSweepPlan } from '../types/index.js';

/** A profile the plan never meant to touch, reported rather than omitted. */
function skipped(profile: string): ScheduleMutation {
  return {
    profile,
    outcome: 'skipped',
    previousState: undefined,
    currentState: undefined,
    scheduleArn: undefined,
    error: undefined,
  };
}

/**
 * Rebuilds the per-profile array by walking the configured profile order.
 *
 * Same structural defence as in `readSchedules`: a profile that appears in
 * neither map becomes a synthetic failure instead of disappearing from the
 * report, and the rows come out in configuration order.
 */
function indexByProfile(
  profiles: ReadonlyArray<string>,
  results: ReadonlyMap<string, ScheduleMutation>,
  errors: ReadonlyMap<string, Error>,
): ReadonlyArray<ScheduleMutation> {
  return profiles.map((profile): ScheduleMutation => {
    const mutation = results.get(profile);
    if (mutation !== undefined) {
      return mutation;
    }

    return {
      profile,
      outcome: 'failed',
      previousState: undefined,
      currentState: undefined,
      scheduleArn: undefined,
      error: errors.get(profile) ?? new Error(`Profile "${profile}" produced no result`),
    };
  });
}

/**
 * Applies the plan, in parallel, across every configured profile.
 *
 * The fan-out covers all profiles and no-ops inside the handler rather than
 * being driven by a filtered list: `mapParallelSettled` is the repo's only
 * settled idiom, and the skipped rows are what lets the report state
 * `sso_prod — SKIPPED` positively instead of leaving an absence to interpret.
 * A skipped profile never reaches `clientProvider.scheduler`, and the client
 * getters are lazy, so it costs neither a client nor a credential use.
 *
 * @param script - The GOScript instance providing the AWS clients and the spinners
 * @param config - Validated script configuration, with `scheduleName` already checked
 * @param plan - The plan produced by `planScheduleSweep`
 * @returns One mutation per configured profile, in configuration order
 */
export async function applyScheduleSweep(
  script: Core.GOScript,
  config: AwsScheduleEventbridgeConfig,
  plan: ScheduleSweepPlan,
): Promise<ReadonlyArray<ScheduleMutation>> {
  const scheduleName = config.scheduleName;
  if (scheduleName === undefined) {
    throw new Error('--schedule-name is required to write a schedule');
  }

  const targets = new Set(plan.changeNeeded.map((entry) => entry.profile));

  const { results, errors } = await script.aws.clients.mapParallelSettled(
    async (profile, clientProvider): Promise<ScheduleMutation> => {
      if (!targets.has(profile)) {
        return skipped(profile);
      }

      script.prompt.spin(profile, `${profile}: setting "${scheduleName}" to ${plan.targetState}...`);
      const service = new AWS.AWSSchedulerService(clientProvider.scheduler);

      try {
        const change = await service.setScheduleState(scheduleName, plan.targetState, config.scheduleGroup);

        if (change.unchanged) {
          // Someone moved the schedule between the preview and this write.
          script.prompt.spinWarn(profile, `${profile}: already ${change.currentState}, no update issued`);
        } else {
          script.prompt.spinSucceed(
            profile,
            `${profile}: ${change.previousState ?? 'UNKNOWN'} -> ${change.currentState}`,
          );
        }

        return {
          profile,
          outcome: change.unchanged ? 'unchanged' : 'changed',
          previousState: change.previousState,
          currentState: change.currentState,
          scheduleArn: change.scheduleArn,
          error: undefined,
        };
      } catch (error: unknown) {
        const failure = error instanceof Error ? error : new Error(String(error));
        script.prompt.spinFail(profile, `${profile}: ${failure.message}`);

        return {
          profile,
          outcome: 'failed',
          previousState: undefined,
          currentState: undefined,
          scheduleArn: undefined,
          error: failure,
        };
      }
    },
  );

  return indexByProfile(script.aws.clients.profileNames, results, errors);
}
