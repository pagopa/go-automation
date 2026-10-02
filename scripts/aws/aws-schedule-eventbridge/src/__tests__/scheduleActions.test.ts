/**
 * Test dei libs di aws-schedule-eventbridge.
 *
 * `GOScript` e `AWSSchedulerService` sono superfici ampie: i libs usano solo
 * `logger`/`prompt` del primo e tre metodi del secondo, quindi si mockano quelle
 * sole parti con un cast finale. I doubles stanno in questo file perché nel
 * monorepo ogni file di test è autosufficiente (niente moduli helper dentro
 * `__tests__/`: non sono esclusi da `tsc` e finirebbero in `dist/`).
 *
 * Esecuzione:
 *   pnpm --filter=aws-schedule-eventbridge test
 *   node --import tsx/esm --test scripts/aws/aws-schedule-eventbridge/src/__tests__/scheduleActions.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWS, Core } from '@go-automation/go-common';

import { runDescribeSchedule } from '../libs/describeSchedule.js';
import { runListSchedules } from '../libs/listSchedules.js';
import { runSetScheduleState } from '../libs/setScheduleState.js';
import { displayScheduleDetail, displayScheduleTable } from '../libs/scheduleDisplay.js';
import { isScheduleAction } from '../libs/isScheduleAction.js';
import { isScheduleState } from '../libs/isScheduleState.js';
import type { AwsScheduleEventbridgeConfig } from '../types/index.js';

interface LoggedCall {
  readonly method: string;
  readonly payload: unknown;
}

interface MockScript {
  readonly script: Core.GOScript;
  readonly calls: LoggedCall[];
  readonly confirmCalls: string[];
}

/** Builds a GOScript double whose logger records every call. */
function createMockScript(confirmResult?: boolean): MockScript {
  const calls: LoggedCall[] = [];
  const confirmCalls: string[] = [];

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
    prompt: {
      confirm: async (message: string): Promise<boolean | undefined> => {
        confirmCalls.push(message);
        return await Promise.resolve(confirmResult);
      },
    },
  } as unknown as Core.GOScript;

  return { script, calls, confirmCalls };
}

interface GetScheduleCall {
  readonly name: string;
  readonly groupName: string | undefined;
}

interface SetScheduleStateCall {
  readonly name: string;
  readonly state: AWS.ScheduleState;
  readonly groupName: string | undefined;
}

interface SchedulerServiceCalls {
  readonly getSchedule: GetScheduleCall[];
  readonly listSchedules: (AWS.AWSScheduleListFilters | undefined)[];
  readonly setScheduleState: SetScheduleStateCall[];
}

interface SchedulerServiceStubs {
  readonly schedule?: AWS.GetScheduleCommandOutput;
  readonly summaries?: ReadonlyArray<AWS.ScheduleSummary>;
}

/** Builds an AWSSchedulerService double recording calls and replaying stubs. */
function createMockSchedulerService(stubs: SchedulerServiceStubs = {}): {
  readonly service: AWS.AWSSchedulerService;
  readonly calls: SchedulerServiceCalls;
} {
  const calls: SchedulerServiceCalls = { getSchedule: [], listSchedules: [], setScheduleState: [] };

  const service = {
    getSchedule: async (name: string, groupName?: string): Promise<AWS.GetScheduleCommandOutput> => {
      calls.getSchedule.push({ name, groupName });
      return await Promise.resolve(stubs.schedule ?? { $metadata: {} });
    },
    listSchedules: async (filters?: AWS.AWSScheduleListFilters): Promise<AWS.ScheduleSummary[]> => {
      calls.listSchedules.push(filters);
      return await Promise.resolve([...(stubs.summaries ?? [])]);
    },
    setScheduleState: async (
      name: string,
      state: AWS.ScheduleState,
      groupName?: string,
    ): Promise<AWS.AWSScheduleStateChange> => {
      calls.setScheduleState.push({ name, state, groupName });
      return await Promise.resolve({
        previousState: state === 'ENABLED' ? 'DISABLED' : 'ENABLED',
        currentState: state,
        scheduleArn: 'arn:aws:scheduler:eu-south-1:123456789012:schedule/default/nightly-job',
        unchanged: false,
      });
    },
  } as unknown as AWS.AWSSchedulerService;

  return { service, calls };
}

/** Builds a config, applying the given overrides on top of the defaults. */
function buildConfig(overrides: Partial<AwsScheduleEventbridgeConfig> = {}): AwsScheduleEventbridgeConfig {
  return {
    awsProfile: 'sso_test',
    awsRegion: 'eu-south-1',
    action: 'list',
    scheduleGroup: 'default',
    yes: false,
    ...overrides,
  };
}

const ENABLED_SCHEDULE: AWS.GetScheduleCommandOutput = {
  $metadata: {},
  Arn: 'arn:aws:scheduler:eu-south-1:123456789012:schedule/default/nightly-job',
  Name: 'nightly-job',
  GroupName: 'default',
  State: 'ENABLED',
  ScheduleExpression: 'cron(0 2 * * ? *)',
  Description: 'Nightly reconciliation job',
  Target: {
    Arn: 'arn:aws:lambda:eu-south-1:123456789012:function:reconcile',
    RoleArn: 'arn:aws:iam::123456789012:role/scheduler-invoke',
  },
};

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

describe('runListSchedules', () => {
  it('passes the group and omits the filters that were not provided', async () => {
    const { script } = createMockScript();
    const { service, calls } = createMockSchedulerService({ summaries: [{ Name: 'nightly-job' }] });

    await runListSchedules(script, service, buildConfig({ scheduleGroup: 'batch' }));

    assert.equal(calls.listSchedules.length, 1);
    assert.deepEqual(calls.listSchedules[0], { groupName: 'batch' });
  });

  it('forwards the name prefix and state filters', async () => {
    const { script } = createMockScript();
    const { service, calls } = createMockSchedulerService({ summaries: [{ Name: 'nightly-job' }] });

    await runListSchedules(script, service, buildConfig({ namePrefix: 'nightly', state: 'ENABLED' }));

    assert.deepEqual(calls.listSchedules[0], {
      groupName: 'default',
      namePrefix: 'nightly',
      state: 'ENABLED',
    });
  });

  it('reports an empty result without rendering a table', async () => {
    const { script, calls } = createMockScript();
    const { service } = createMockSchedulerService({ summaries: [] });

    await runListSchedules(script, service, buildConfig());

    assert.equal(
      calls.some((call) => call.method === 'table'),
      false,
    );
    assert.deepEqual(calls.at(-1), { method: 'info', payload: 'No schedules match the given filters.' });
  });

  it('renders one table row per schedule', async () => {
    const { script, calls } = createMockScript();
    const { service } = createMockSchedulerService({
      summaries: [
        { Name: 'a', GroupName: 'default', State: 'ENABLED', Target: { Arn: 'arn:a' } },
        { Name: 'b', GroupName: 'default', State: 'DISABLED' },
      ],
    });

    await runListSchedules(script, service, buildConfig());

    const table = calls.find((call) => call.method === 'table')?.payload as Core.GOTableOptions | undefined;
    assert.equal(table?.data.length, 2);
    assert.equal(table?.data[0]?.['name'], 'a');
    assert.equal(table?.data[1]?.['targetArn'], '-');
  });
});

describe('runDescribeSchedule', () => {
  it('fetches the schedule in its group and prints the detail', async () => {
    const { script, calls } = createMockScript();
    const { service, calls: serviceCalls } = createMockSchedulerService({ schedule: ENABLED_SCHEDULE });

    await runDescribeSchedule(script, service, buildConfig({ action: 'describe', scheduleName: 'nightly-job' }));

    assert.deepEqual(serviceCalls.getSchedule, [{ name: 'nightly-job', groupName: 'default' }]);
    const detail = calls.find((call) => call.method === 'keyValueTable')?.payload as
      Record<string, unknown> | undefined;
    assert.equal(detail?.['Name'], 'nightly-job');
    assert.equal(detail?.['State'], 'ENABLED');
  });

  it('refuses to run without a schedule name', async () => {
    const { script } = createMockScript();
    const { service } = createMockSchedulerService();

    await assert.rejects(
      runDescribeSchedule(script, service, buildConfig({ action: 'describe' })),
      /--schedule-name is required/,
    );
  });
});

describe('runSetScheduleState', () => {
  const disableConfig = buildConfig({ action: 'disable', scheduleName: 'nightly-job' });

  it('applies the change once confirmed', async () => {
    const { script, calls, confirmCalls } = createMockScript(true);
    const { service, calls: serviceCalls } = createMockSchedulerService({ schedule: ENABLED_SCHEDULE });

    await runSetScheduleState(script, service, disableConfig, 'DISABLED');

    assert.deepEqual(confirmCalls, ['Set schedule "nightly-job" to DISABLED?']);
    assert.deepEqual(serviceCalls.setScheduleState, [{ name: 'nightly-job', state: 'DISABLED', groupName: 'default' }]);
    assert.equal(
      calls.some((call) => call.method === 'success'),
      true,
    );
  });

  it('mutates nothing when the confirmation is refused', async () => {
    const { script, calls } = createMockScript(false);
    const { service, calls: serviceCalls } = createMockSchedulerService({ schedule: ENABLED_SCHEDULE });

    await runSetScheduleState(script, service, disableConfig, 'DISABLED');

    assert.deepEqual(serviceCalls.setScheduleState, []);
    assert.ok(calls.some((call) => call.method === 'warning' && call.payload === 'Operation cancelled by user.'));
  });

  it('treats a cancelled prompt (undefined) as a refusal', async () => {
    // No argument → `prompt.confirm` resolves to undefined, i.e. the prompt was cancelled.
    const { script, calls } = createMockScript();
    const { service, calls: serviceCalls } = createMockSchedulerService({ schedule: ENABLED_SCHEDULE });

    await runSetScheduleState(script, service, disableConfig, 'DISABLED');

    assert.deepEqual(serviceCalls.setScheduleState, []);
    assert.ok(calls.some((call) => call.method === 'warning' && call.payload === 'Operation cancelled by user.'));
  });

  it('skips the confirmation when --yes is set', async () => {
    const { script, confirmCalls } = createMockScript();
    const { service, calls: serviceCalls } = createMockSchedulerService({ schedule: ENABLED_SCHEDULE });

    await runSetScheduleState(script, service, { ...disableConfig, yes: true }, 'DISABLED');

    assert.deepEqual(confirmCalls, []);
    assert.equal(serviceCalls.setScheduleState.length, 1);
  });

  it('returns early, without prompting, when the state already matches', async () => {
    const { script, calls, confirmCalls } = createMockScript(true);
    const { service, calls: serviceCalls } = createMockSchedulerService({ schedule: ENABLED_SCHEDULE });

    await runSetScheduleState(
      script,
      service,
      buildConfig({ action: 'enable', scheduleName: 'nightly-job' }),
      'ENABLED',
    );

    assert.deepEqual(confirmCalls, []);
    assert.deepEqual(serviceCalls.setScheduleState, []);
    assert.ok(
      calls.some(
        (call) =>
          call.method === 'info' && call.payload === 'Schedule "nightly-job" is already ENABLED. Nothing to do.',
      ),
    );
  });

  it('refuses to run without a schedule name', async () => {
    const { script } = createMockScript(true);
    const { service } = createMockSchedulerService();

    await assert.rejects(
      runSetScheduleState(script, service, buildConfig({ action: 'disable' }), 'DISABLED'),
      /--schedule-name is required/,
    );
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
