/**
 * Test della metà pura di aws-schedule-eventbridge: validazione dei parametri,
 * classificazione del piano, verdetto della flotta e rendering.
 *
 * `planScheduleSweep` e `buildSweepVerdict` non vogliono nessun double — è
 * l'intera ragione per cui sono estratti dal fan-out. Il solo double qui è il
 * logger, per catturare quello che il rendering emette.
 *
 * Esecuzione:
 *   pnpm --filter=aws-schedule-eventbridge test
 *   node --import tsx/esm --test scripts/aws/aws-schedule-eventbridge/src/__tests__/scheduleDisplay.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOConfigParameterValue, GOScript } from '@go-automation/go-script';
import type { GetScheduleCommandOutput, ScheduleState } from '@pagopa/go-aws/scheduler';
import type { GOTableOptions } from '@pagopa/go-common/render';

import { scriptParameters } from '../config.js';
import { buildSweepVerdict } from '../libs/buildSweepVerdict.js';
import { isScheduleNotFound } from '../libs/isScheduleNotFound.js';
import { planScheduleSweep } from '../libs/planScheduleSweep.js';
import { displayScheduleDetail, displayScheduleDrift } from '../libs/scheduleDisplay.js';
import type { ScheduleMutation, ScheduleMutationOutcome, ScheduleRead, ScheduleSweepVerdict } from '../types/index.js';

interface LoggedCall {
  readonly method: string;
  readonly payload: unknown;
}

/** Builds a GOScript double whose logger records every call. */
function createMockScript(): { readonly script: GOScript; readonly calls: LoggedCall[] } {
  const calls: LoggedCall[] = [];

  const record =
    (method: string) =>
    (payload: unknown): void => {
      calls.push({ method, payload });
    };

  const script = {
    logger: { section: record('section'), table: record('table'), keyValueTable: record('keyValueTable') },
  } as unknown as GOScript;

  return { script, calls };
}

/** A profile whose schedule was read successfully, currently in `state`. */
function foundRead(profile: string, state: ScheduleState): ScheduleRead {
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

/** Renders one schedule detail block and returns the key/value table it printed. */
function renderDetail(schedule: GetScheduleCommandOutput): Record<string, unknown> | undefined {
  const { script, calls } = createMockScript();
  displayScheduleDetail(script, schedule);
  return calls[0]?.payload as Record<string, unknown> | undefined;
}

describe('parameter validators', () => {
  /** Runs the declared validator of a parameter on a value. */
  function validate(name: string, value: GOConfigParameterValue): boolean | string | undefined {
    return scriptParameters.find((parameter) => parameter.name === name)?.validator?.(value);
  }

  const cases: ReadonlyArray<{
    readonly name: string;
    readonly value: GOConfigParameterValue;
    readonly expected: true | RegExp;
  }> = [
    // `--aws-profiles ''` and `--aws-profiles ,` both reach the validator as [],
    // which would otherwise fall back to the default credential chain.
    { name: 'aws.profiles', value: [], expected: /At least one AWS profile is required/ },
    { name: 'aws.profiles', value: ['sso_dev', 'sso_prod'], expected: true },
    { name: 'action', value: 'disable', expected: true },
    { name: 'action', value: 'delete', expected: /Invalid action "delete"/ },
    { name: 'state', value: 'DISABLED', expected: true },
    { name: 'state', value: 'enabled', expected: /Invalid state "enabled"/ },
  ];

  for (const { name, value, expected } of cases) {
    it(`${name} = ${JSON.stringify(value)} -> ${String(expected)}`, () => {
      const result = validate(name, value);
      if (expected === true) assert.equal(result, true);
      else assert.match(String(result), expected);
    });
  }
});

describe('isScheduleNotFound', () => {
  it('recognises only the Scheduler not-found error, by name', () => {
    const notFound = new Error('Schedule nightly-job does not exist');
    notFound.name = 'ResourceNotFoundException';

    assert.equal(isScheduleNotFound(notFound), true);
    assert.equal(isScheduleNotFound(new Error('AccessDeniedException')), false);
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
    assert.deepEqual(
      plan.changeNeeded.map((entry) => entry.profile),
      ['sso_dev'],
    );
    assert.equal(plan.profileCount, 4);
    assert.equal(plan.targetState, 'DISABLED');
    // The read fields stay on the entry, so the preview can be built from it.
    assert.equal(plan.entries[2]?.error?.message, 'AccessDeniedException');
  });
});

describe('buildSweepVerdict', () => {
  it('partitions the fleet: the five counters add up to the profile count', () => {
    const plan = planScheduleSweep(
      [
        foundRead('sso_a', 'ENABLED'),
        foundRead('sso_b', 'ENABLED'),
        foundRead('sso_c', 'ENABLED'),
        foundRead('sso_d', 'ENABLED'),
        foundRead('sso_e', 'DISABLED'),
        missingRead('sso_f'),
        failedRead('sso_g'),
      ],
      'DISABLED',
    );

    const verdict = buildSweepVerdict(
      plan,
      [
        mutation('sso_a', 'changed'),
        mutation('sso_b', 'failed'),
        mutation('sso_c', 'skipped'),
        // Moved between the preview and the write: converged either way.
        mutation('sso_d', 'unchanged'),
      ],
      false,
    );

    assert.deepEqual(verdict, {
      profileCount: 7,
      changed: 1,
      unchanged: 2,
      pending: 1,
      missing: 1,
      failed: 2,
      converged: false,
    } satisfies ScheduleSweepVerdict);
  });

  const convergenceCases: ReadonlyArray<{
    readonly title: string;
    readonly reads: ReadonlyArray<ScheduleRead>;
    readonly mutations: ReadonlyArray<ScheduleMutation>;
    readonly failOnMissing: boolean;
    readonly converged: boolean;
  }> = [
    {
      title: 'every account changed or already in the target state',
      reads: [foundRead('sso_dev', 'ENABLED'), foundRead('sso_uat', 'DISABLED')],
      mutations: [mutation('sso_dev', 'changed')],
      failOnMissing: false,
      converged: true,
    },
    {
      title: 'a schedule moved between the preview and the write',
      reads: [foundRead('sso_dev', 'ENABLED')],
      mutations: [mutation('sso_dev', 'unchanged')],
      failOnMissing: false,
      converged: true,
    },
    {
      title: 'a write failed',
      reads: [foundRead('sso_dev', 'ENABLED')],
      mutations: [mutation('sso_dev', 'failed')],
      failOnMissing: false,
      converged: false,
    },
    {
      title: 'a read failed, with no mutations at all',
      reads: [failedRead('sso_dev')],
      mutations: [],
      failOnMissing: false,
      converged: false,
    },
    {
      title: 'a missing schedule, tolerated by default',
      reads: [missingRead('sso_dev'), foundRead('sso_uat', 'DISABLED')],
      mutations: [],
      failOnMissing: false,
      converged: true,
    },
    {
      title: 'a missing schedule under --fail-on-missing',
      reads: [missingRead('sso_dev'), foundRead('sso_uat', 'DISABLED')],
      mutations: [],
      failOnMissing: true,
      converged: false,
    },
  ];

  for (const { title, reads, mutations, failOnMissing, converged } of convergenceCases) {
    it(`${converged ? 'converges' : 'does not converge'} when ${title}`, () => {
      const plan = planScheduleSweep(reads, 'DISABLED');

      assert.equal(buildSweepVerdict(plan, mutations, failOnMissing).converged, converged);
    });
  }
});

describe('scheduleDisplay', () => {
  it('labels a drift row by what went wrong when the schedule is absent', () => {
    const { script, calls } = createMockScript();

    displayScheduleDrift(script, [foundRead('sso_dev', 'ENABLED'), missingRead('sso_uat'), failedRead('sso_prod')]);

    const table = calls.find((call) => call.method === 'table')?.payload as GOTableOptions | undefined;
    assert.deepEqual(
      table?.data.map((row) => [row['profile'], row['state'], row['accountId']]),
      [
        ['sso_dev', 'ENABLED', '123456789012'],
        ['sso_uat', 'MISSING', '123456789012'],
        ['sso_prod', 'ERROR', '-'],
      ],
    );
  });

  it('prints the target input and the service-specific parameter block', () => {
    const detail = renderDetail({
      $metadata: {},
      Name: 'nightly-job',
      Target: {
        Arn: 'arn:aws:ecs:eu-south-1:123456789012:cluster/batch',
        RoleArn: 'arn:aws:iam::123456789012:role/scheduler-invoke',
        Input: '{"mode":"full"}',
        EcsParameters: { TaskDefinitionArn: 'arn:aws:ecs:eu-south-1:123456789012:task-definition/job:7' },
      },
    });

    assert.equal(detail?.['Target Input'], '{"mode":"full"}');
    assert.match(String(detail?.['Target Parameters']), /^EcsParameters=\{"TaskDefinitionArn":/);
  });

  it('replaces missing fields with a dash and formats dates as UTC', () => {
    const detail = renderDetail({
      $metadata: {},
      Name: 'nightly-job',
      LastModificationDate: new Date('2026-09-15T08:30:00.000Z'),
      Target: { Arn: 'arn:aws:lambda:eu-south-1:123456789012:function:reconcile', RoleArn: 'arn:role' },
    });

    assert.equal(detail?.['Description'], '-');
    assert.equal(detail?.['Start Date'], '-');
    assert.equal(detail?.['Target Parameters'], '-');
    assert.equal(detail?.['Target Input'], '-');
    assert.equal(detail?.['Last Modification Date'], '2026-09-15T08:30:00.000Z');
  });
});
