/**
 * Phase 5 of the sweep: collapses plan and outcomes into the exit-code decision.
 *
 * Pure by design, like `planScheduleSweep`: whether the process exits non-zero
 * is decided here, and nowhere else.
 */

import type {
  ScheduleMutation,
  ScheduleMutationOutcome,
  ScheduleSweepEntry,
  ScheduleSweepPlan,
  ScheduleSweepVerdict,
} from '../types/index.js';

/** Mutable tally, one bucket per configured profile. */
interface SweepTally {
  changed: number;
  unchanged: number;
  pending: number;
  missing: number;
  failed: number;
}

/** Buckets one planned-to-update account by what the write actually did. */
function tallyUpdate(tally: SweepTally, outcome: ScheduleMutationOutcome | undefined): void {
  switch (outcome) {
    case 'changed':
      tally.changed += 1;
      break;
    case 'unchanged':
      // Someone moved it between the preview and the write: converged either way.
      tally.unchanged += 1;
      break;
    case 'failed':
      tally.failed += 1;
      break;
    default:
      // `skipped`, or no write phase at all (dry run).
      tally.pending += 1;
  }
}

/** Buckets one account by its planned action, deferring `update` to the outcome. */
function tallyEntry(
  tally: SweepTally,
  entry: ScheduleSweepEntry,
  outcomeByProfile: ReadonlyMap<string, ScheduleMutationOutcome>,
): void {
  switch (entry.action) {
    case 'no-op':
      tally.unchanged += 1;
      break;
    case 'missing':
      tally.missing += 1;
      break;
    case 'error':
      tally.failed += 1;
      break;
    default:
      // `update`: the write phase had the last word.
      tallyUpdate(tally, outcomeByProfile.get(entry.profile));
  }
}

/**
 * Builds the fleet verdict.
 *
 * A missing schedule counts against convergence only under `--fail-on-missing`:
 * by default it is drift to report, not a reason to exit non-zero.
 *
 * @param plan - The plan the sweep was built from
 * @param mutations - Write outcomes, empty when no write phase ran
 * @param failOnMissing - Whether an account without the schedule is fatal
 * @returns The per-bucket counters and the convergence flag
 */
export function buildSweepVerdict(
  plan: ScheduleSweepPlan,
  mutations: ReadonlyArray<ScheduleMutation>,
  failOnMissing: boolean,
): ScheduleSweepVerdict {
  const outcomeByProfile = new Map(mutations.map((mutation) => [mutation.profile, mutation.outcome]));
  const tally: SweepTally = { changed: 0, unchanged: 0, pending: 0, missing: 0, failed: 0 };

  for (const entry of plan.entries) {
    tallyEntry(tally, entry, outcomeByProfile);
  }

  return {
    profileCount: plan.profileCount,
    changed: tally.changed,
    unchanged: tally.unchanged,
    pending: tally.pending,
    missing: tally.missing,
    failed: tally.failed,
    converged: tally.failed === 0 && (tally.missing === 0 || !failOnMissing),
  };
}
