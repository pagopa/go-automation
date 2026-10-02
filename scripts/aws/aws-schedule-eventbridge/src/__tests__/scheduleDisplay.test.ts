/**
 * Test della metà pura di aws-schedule-eventbridge: type guard, classificazione
 * del piano, verdetto della flotta e rendering.
 *
 * `planScheduleSweep` e `buildSweepVerdict` non vogliono nessun double — è
 * l'intera ragione per cui sono estratti dal fan-out. Il solo double qui è il
 * logger, per catturare quello che il rendering emette. I doubles stanno in
 * questo file perché nel monorepo ogni file di test è autosufficiente (niente
 * moduli helper dentro `__tests__/`: non sono esclusi da `tsc` e finirebbero in
 * `dist/`).
 *
 * Esecuzione:
 *   pnpm --filter=aws-schedule-eventbridge test
 *   node --import tsx/esm --test scripts/aws/aws-schedule-eventbridge/src/__tests__/scheduleDisplay.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWS, Core } from '@go-automation/go-common';

import { buildSweepVerdict } from '../libs/buildSweepVerdict.js';
import { isScheduleAction } from '../libs/isScheduleAction.js';
import { isScheduleNotFound } from '../libs/isScheduleNotFound.js';
import { isScheduleState } from '../libs/isScheduleState.js';
import { planScheduleSweep } from '../libs/planScheduleSweep.js';
import { displayScheduleDetail, displayScheduleTable } from '../libs/scheduleDisplay.js';
import type { ScheduleMutation, ScheduleMutationOutcome, ScheduleRead } from '../types/index.js';

interface LoggedCall {
  readonly method: string;
  readonly payload: unknown;
}

/** Builds a GOScript double whose logger records every call. */
function createMockScript(): { readonly script: Core.GOScript; readonly calls: LoggedCall[] } {
  const calls: LoggedCall[] = [];

  const record =
    (method: string) =>
    (payload: unknown): void => {
      calls.push({ method, payload });
    };

  const script = {
    logger: {
      section: record('section'),
      info: record('info'),
      success: record('success'),
      warning: record('warning'),
      error: record('error'),
      table: record('table'),
      keyValueTable: record('keyValueTable'),
    },
  } as unknown as Core.GOScript;

  return { script, calls };
}

/** A profile whose schedule was read successfully, currently in `state`. */
function foundRead(profile: string, state: AWS.ScheduleState): ScheduleRead {
  return {
    profile,
    accountId: '123456789012',
    schedule: { $metadata: {}, Name: 'nightly-job', State: state },
    status: 'found',
    error: undefined,
  };
}

/** A profile that simply does not declare the schedule. */
function missingRead(profile: string): ScheduleRead {
  return { profile, accountId: '123456789012', schedule: undefined, status: 'not-found', error: undefined };
}

/** A profile whose read blew up. */
function failedRead(profile: string): ScheduleRead {
  return {
    profile,
    accountId: undefined,
    schedule: undefined,
    status: 'error',
    error: new Error('AccessDeniedException'),
  };
}

/** A write outcome for one profile, with the state fields the summary never reads. */
function mutation(profile: string, outcome: ScheduleMutationOutcome): ScheduleMutation {
  return {
    profile,
    outcome,
    previousState: 'ENABLED',
    currentState: outcome === 'failed' ? undefined : 'DISABLED',
    scheduleArn: undefined,
    error: outcome === 'failed' ? new Error('ConflictException') : undefined,
  };
}

describe('type guards', () => {
  it('accepts the supported actions and rejects anything else', () => {
    assert.equal(isScheduleAction('list'), true);
    assert.equal(isScheduleAction('disable'), true);
    assert.equal(isScheduleAction('delete'), false);
  });

  it('accepts only the two schedule states', () => {
    assert.equal(isScheduleState('ENABLED'), true);
    assert.equal(isScheduleState('DISABLED'), true);
    assert.equal(isScheduleState('enabled'), false);
  });
});

describe('isScheduleNotFound', () => {
  it('recognises the Scheduler not-found error by name', () => {
    const error = new Error('Schedule nightly-job does not exist');
    error.name = 'ResourceNotFoundException';

    assert.equal(isScheduleNotFound(error), true);
  });

  it('rejects an unrelated error', () => {
    assert.equal(isScheduleNotFound(new Error('AccessDeniedException')), false);
  });

  it('rejects a value that is not an Error at all', () => {
    assert.equal(isScheduleNotFound('ResourceNotFoundException'), false);
    assert.equal(isScheduleNotFound(undefined), false);
  });
});

describe('planScheduleSweep', () => {
  it('assigns all four actions from a mixed set, preserving the configuration order', () => {
    const plan = planScheduleSweep(
      [
        foundRead('sso_dev', 'ENABLED'),
        missingRead('sso_uat'),
        failedRead('sso_hotfix'),
        foundRead('sso_prod', 'DISABLED'),
      ],
      'DISABLED',
    );

    assert.deepEqual(
      plan.entries.map((entry) => [entry.profile, entry.action]),
      [
        ['sso_dev', 'update'],
        ['sso_uat', 'missing'],
        ['sso_hotfix', 'error'],
        ['sso_prod', 'no-op'],
      ],
    );
    assert.equal(plan.profileCount, 4);
    assert.equal(plan.targetState, 'DISABLED');
  });

  it('collects only the accounts that need a write in changeNeeded', () => {
    const plan = planScheduleSweep(
      [foundRead('sso_dev', 'DISABLED'), foundRead('sso_uat', 'ENABLED'), missingRead('sso_prod')],
      'ENABLED',
    );

    assert.deepEqual(
      plan.changeNeeded.map((entry) => entry.profile),
      ['sso_dev'],
    );
  });

  it('keeps the read fields on the entry so the preview can be built from it', () => {
    const plan = planScheduleSweep([failedRead('sso_dev')], 'ENABLED');

    assert.equal(plan.entries[0]?.error?.message, 'AccessDeniedException');
    assert.equal(plan.entries[0]?.accountId, undefined);
  });

  it('plans nothing for an empty profile list', () => {
    const plan = planScheduleSweep([], 'ENABLED');

    assert.deepEqual(plan.entries, []);
    assert.deepEqual(plan.changeNeeded, []);
    assert.equal(plan.profileCount, 0);
  });
});

describe('buildSweepVerdict', () => {
  it('converges when every account was changed', () => {
    const plan = planScheduleSweep([foundRead('sso_dev', 'ENABLED'), foundRead('sso_uat', 'ENABLED')], 'DISABLED');

    const verdict = buildSweepVerdict(plan, [mutation('sso_dev', 'changed'), mutation('sso_uat', 'changed')], false);

    assert.deepEqual(verdict, {
      profileCount: 2,
      changed: 2,
      unchanged: 0,
      pending: 0,
      missing: 0,
      failed: 0,
      converged: true,
    });
  });

  it('does not converge when a write failed', () => {
    const plan = planScheduleSweep([foundRead('sso_dev', 'ENABLED'), foundRead('sso_uat', 'ENABLED')], 'DISABLED');

    const verdict = buildSweepVerdict(plan, [mutation('sso_dev', 'changed'), mutation('sso_uat', 'failed')], false);

    assert.equal(verdict.changed, 1);
    assert.equal(verdict.failed, 1);
    assert.equal(verdict.converged, false);
  });

  it('counts a read failure as failed even with no mutations at all', () => {
    const plan = planScheduleSweep([failedRead('sso_dev'), foundRead('sso_uat', 'ENABLED')], 'DISABLED');

    const verdict = buildSweepVerdict(plan, [], false);

    assert.equal(verdict.failed, 1);
    assert.equal(verdict.pending, 1);
    assert.equal(verdict.converged, false);
  });

  it('treats an account already in the target state as unchanged', () => {
    const plan = planScheduleSweep([foundRead('sso_dev', 'DISABLED')], 'DISABLED');

    const verdict = buildSweepVerdict(plan, [], false);

    assert.equal(verdict.unchanged, 1);
    assert.equal(verdict.pending, 0);
    assert.equal(verdict.converged, true);
  });

  it('treats a schedule moved between preview and write as unchanged', () => {
    const plan = planScheduleSweep([foundRead('sso_dev', 'ENABLED')], 'DISABLED');

    const verdict = buildSweepVerdict(plan, [mutation('sso_dev', 'unchanged')], false);

    assert.equal(verdict.unchanged, 1);
    assert.equal(verdict.converged, true);
  });

  it('reports a missing schedule without failing, unless --fail-on-missing is set', () => {
    const plan = planScheduleSweep([missingRead('sso_dev'), foundRead('sso_uat', 'DISABLED')], 'DISABLED');

    assert.equal(buildSweepVerdict(plan, [], false).missing, 1);
    assert.equal(buildSweepVerdict(plan, [], false).converged, true);
    assert.equal(buildSweepVerdict(plan, [], true).converged, false);
  });

  it('partitions the fleet: the five counters add up to the profile count', () => {
    const plan = planScheduleSweep(
      [
        foundRead('sso_a', 'ENABLED'),
        foundRead('sso_b', 'ENABLED'),
        foundRead('sso_c', 'ENABLED'),
        foundRead('sso_d', 'DISABLED'),
        missingRead('sso_e'),
        failedRead('sso_f'),
      ],
      'DISABLED',
    );

    const verdict = buildSweepVerdict(
      plan,
      [mutation('sso_a', 'changed'), mutation('sso_b', 'failed'), mutation('sso_c', 'skipped')],
      false,
    );

    assert.equal(
      verdict.changed + verdict.unchanged + verdict.pending + verdict.missing + verdict.failed,
      verdict.profileCount,
    );
    assert.deepEqual(
      { changed: verdict.changed, unchanged: verdict.unchanged, pending: verdict.pending },
      { changed: 1, unchanged: 1, pending: 1 },
    );
    assert.equal(verdict.failed, 2);
  });
});

describe('scheduleDisplay', () => {
  it('renders the table headers even with an empty list', () => {
    const { script, calls } = createMockScript();

    displayScheduleTable(script, []);

    const table = calls[0]?.payload as Core.GOTableOptions | undefined;
    assert.deepEqual(table?.data, []);
    assert.deepEqual(
      table?.columns.map((column) => column.header),
      ['Name', 'Group', 'State', 'Target ARN', 'Last Modified'],
    );
  });

  it('replaces missing fields with a dash and formats dates as UTC', () => {
    const { script, calls } = createMockScript();

    displayScheduleDetail(script, {
      $metadata: {},
      Name: 'nightly-job',
      LastModificationDate: new Date('2026-09-15T08:30:00.000Z'),
    });

    const detail = calls[0]?.payload as Record<string, unknown> | undefined;
    assert.equal(detail?.['Description'], '-');
    assert.equal(detail?.['Start Date'], '-');
    assert.equal(detail?.['Last Modification Date'], '2026-09-15T08:30:00.000Z');
  });
});
