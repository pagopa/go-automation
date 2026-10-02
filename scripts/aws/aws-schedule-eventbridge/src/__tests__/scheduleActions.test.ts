/**
 * Test di tutto ciò che fa fan-out in aws-schedule-eventbridge.
 *
 * Il seam è il `SchedulerClient`, non `AWSSchedulerService`: le libs del sweep
 * costruiscono il service da `clientProvider.scheduler`, quindi il double
 * scende di un livello e il vero `AWSSchedulerService` viene esercitato. Il
 * fake `send()` dispatcha su `command.constructor.name` e registra
 * `command.input`, così un test può asserire il contratto di sostituzione
 * integrale di `UpdateSchedule` — ed è il recorder a dimostrare che *nessun*
 * account è stato toccato quando non doveva.
 *
 * Il fake di `mapParallelSettled` replica fedelmente il filtro
 * `result !== undefined` di go-common, buco compreso: `dropResult` lo sfrutta
 * per verificare che le libs ricostruiscano comunque una voce per profilo.
 *
 * I doubles stanno in questo file perché nel monorepo ogni file di test è
 * autosufficiente (niente moduli helper dentro `__tests__/`: non sono esclusi
 * da `tsc` e finirebbero in `dist/`).
 *
 * Esecuzione:
 *   pnpm --filter=aws-schedule-eventbridge test
 *   node --import tsx/esm --test scripts/aws/aws-schedule-eventbridge/src/__tests__/scheduleActions.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWS, Core } from '@go-automation/go-common';

import { applyScheduleSweep } from '../libs/applyScheduleSweep.js';
import { confirmScheduleSweep } from '../libs/confirmScheduleSweep.js';
import { runDescribeSchedule } from '../libs/describeSchedule.js';
import { runListSchedules } from '../libs/listSchedules.js';
import { planScheduleSweep } from '../libs/planScheduleSweep.js';
import { readSchedules } from '../libs/readSchedules.js';
import { runScheduleSweep } from '../libs/runScheduleSweep.js';
import type { AwsScheduleEventbridgeConfig } from '../types/index.js';

interface LoggedCall {
  readonly method: string;
  readonly payload: unknown;
}

/** One Scheduler API call, as the fake client saw it. */
interface CommandRecord {
  readonly profile: string;
  readonly command: string;
  readonly input: Record<string, unknown>;
}

/** How one account behaves for the duration of a test. */
interface ProfileFixture {
  /** Schedule returned by `GetSchedule`; absent means the account does not have it */
  readonly schedule?: AWS.GetScheduleCommandOutput;

  /** Summaries returned by `ListSchedules` */
  readonly summaries?: ReadonlyArray<AWS.ScheduleSummary>;

  /** Error `GetSchedule` rejects with, taking precedence over `schedule` */
  readonly failWith?: Error;

  /** Error `UpdateSchedule` rejects with */
  readonly failUpdate?: Error;

  /** Account id `resolveAccountId` answers with */
  readonly accountId?: string;

  /** Makes `resolveAccountId` reject, as a profile STS cannot answer for */
  readonly accountIdFails?: boolean;

  /** What a re-read sees, to drive the window between the preview and the write */
  readonly rereadAs?: AWS.GetScheduleCommandOutput;

  /** Drops this profile from both result maps, reproducing the go-common hole */
  readonly dropResult?: boolean;
}

interface SweepHarness {
  readonly script: Core.GOScript;
  readonly commands: CommandRecord[];
  readonly calls: LoggedCall[];
  readonly confirmCalls: string[];
  readonly schedulerAccesses: string[];
}

interface SweepHarnessOptions {
  readonly profiles: ReadonlyArray<readonly [string, ProfileFixture]>;
  readonly confirmResult?: boolean;
}

type MultiProfileOperationFn<T> = (profile: string, clients: AWS.AWSClientProvider) => Promise<T>;

/** The error EventBridge Scheduler raises for a schedule that does not exist. */
function notFoundError(): Error {
  const error = new Error('Schedule nightly-job does not exist');
  error.name = 'ResourceNotFoundException';
  return error;
}

/** A fully populated schedule, so a full-replacement assertion has something to check. */
function scheduleIn(state: AWS.ScheduleState): AWS.GetScheduleCommandOutput {
  return {
    $metadata: {},
    Arn: 'arn:aws:scheduler:eu-south-1:123456789012:schedule/default/nightly-job',
    Name: 'nightly-job',
    GroupName: 'default',
    State: state,
    ScheduleExpression: 'cron(0 2 * * ? *)',
    Description: 'Nightly reconciliation job',
    FlexibleTimeWindow: { Mode: 'OFF' },
    Target: {
      Arn: 'arn:aws:lambda:eu-south-1:123456789012:function:reconcile',
      RoleArn: 'arn:aws:iam::123456789012:role/scheduler-invoke',
      RetryPolicy: { MaximumRetryAttempts: 3 },
    },
  };
}

/**
 * Builds a SchedulerClient double dispatching on the command class name.
 *
 * `readCounts` is owned by the harness, not by the client: the sweep reads in
 * phase 1 and re-reads inside the phase 4 write, through two different client
 * providers, and `rereadAs` has to span both.
 */
function createFakeSchedulerClient(
  profile: string,
  fixture: ProfileFixture,
  commands: CommandRecord[],
  readCounts: Map<string, number>,
): AWS.SchedulerClient {
  const client = {
    async send(command: unknown): Promise<unknown> {
      const name = (command as { readonly constructor: { readonly name: string } }).constructor.name;
      const input = (command as { readonly input: Record<string, unknown> }).input;
      commands.push({ profile, command: name, input });

      switch (name) {
        case 'ListSchedulesCommand':
          return await Promise.resolve({ Schedules: [...(fixture.summaries ?? [])] });
        case 'UpdateScheduleCommand':
          if (fixture.failUpdate !== undefined) throw fixture.failUpdate;
          return await Promise.resolve({ ScheduleArn: `arn:aws:scheduler:eu-south-1::schedule/${profile}` });
        default: {
          // GetScheduleCommand
          const reads = (readCounts.get(profile) ?? 0) + 1;
          readCounts.set(profile, reads);
          if (fixture.failWith !== undefined) throw fixture.failWith;
          const schedule = reads > 1 ? (fixture.rereadAs ?? fixture.schedule) : fixture.schedule;
          if (schedule === undefined) throw notFoundError();
          return await Promise.resolve(schedule);
        }
      }
    },
  };

  return client as unknown as AWS.SchedulerClient;
}

/** Builds an AWSClientProvider double, recording every access to the Scheduler client. */
function createFakeClientProvider(
  profile: string,
  fixture: ProfileFixture,
  commands: CommandRecord[],
  schedulerAccesses: string[],
  readCounts: Map<string, number>,
): AWS.AWSClientProvider {
  const provider = {
    get scheduler(): AWS.SchedulerClient {
      schedulerAccesses.push(profile);
      return createFakeSchedulerClient(profile, fixture, commands, readCounts);
    },
    async resolveAccountId(): Promise<string> {
      if (fixture.accountIdFails === true) throw new Error('STS unavailable');
      return await Promise.resolve(fixture.accountId ?? '123456789012');
    },
  };

  return provider as unknown as AWS.AWSClientProvider;
}

/** Builds a GOScript double with a multi-profile AWS provider over the given fixtures. */
function createSweepHarness(options: SweepHarnessOptions): SweepHarness {
  const commands: CommandRecord[] = [];
  const calls: LoggedCall[] = [];
  const confirmCalls: string[] = [];
  const schedulerAccesses: string[] = [];
  const readCounts = new Map<string, number>();

  const record =
    (method: string) =>
    (payload: unknown): void => {
      calls.push({ method, payload });
    };

  const clients = {
    profileNames: options.profiles.map(([profile]) => profile),
    async mapParallelSettled<T>(operation: MultiProfileOperationFn<T>): Promise<{
      readonly results: Map<string, T>;
      readonly errors: Map<string, Error>;
    }> {
      const settled = await Promise.all(
        options.profiles.map(async ([profile, fixture]) => {
          const clientProvider = createFakeClientProvider(profile, fixture, commands, schedulerAccesses, readCounts);
          try {
            return { profile, fixture, result: await operation(profile, clientProvider), error: undefined };
          } catch (error) {
            return {
              profile,
              fixture,
              result: undefined,
              error: error instanceof Error ? error : new Error(String(error)),
            };
          }
        }),
      );

      const results = new Map<string, T>();
      const errors = new Map<string, Error>();
      for (const entry of settled) {
        // Faithful to AWSMultiClientProvider, hole included: a result that is
        // `undefined` lands in neither map, and `dropResult` forces that shape.
        if (entry.fixture.dropResult === true) continue;
        if (entry.error !== undefined) errors.set(entry.profile, entry.error);
        else if (entry.result !== undefined) results.set(entry.profile, entry.result);
      }

      return { results, errors };
    },
  };

  const script = {
    aws: { clients },
    logger: {
      section: record('section'),
      info: record('info'),
      success: record('success'),
      warning: record('warning'),
      error: record('error'),
      table: record('table'),
      keyValueTable: record('keyValueTable'),
      newline: record('newline'),
    },
    prompt: {
      confirm: async (message: string): Promise<boolean | undefined> => {
        confirmCalls.push(message);
        return await Promise.resolve(options.confirmResult);
      },
      spin: (): void => {},
      spinSucceed: (): void => {},
      spinWarn: (): void => {},
      spinFail: (): void => {},
    },
  } as unknown as Core.GOScript;

  return { script, commands, calls, confirmCalls, schedulerAccesses };
}

interface MockScript {
  readonly script: Core.GOScript;
  readonly calls: LoggedCall[];
}

/** Builds a single-profile GOScript double, for the actions still taking a service. */
function createMockScript(): MockScript {
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

interface SchedulerServiceCalls {
  readonly getSchedule: { readonly name: string; readonly groupName: string | undefined }[];
  readonly listSchedules: (AWS.AWSScheduleListFilters | undefined)[];
}

/** Builds an AWSSchedulerService double, for the actions still taking a service. */
function createMockSchedulerService(
  stubs: {
    readonly schedule?: AWS.GetScheduleCommandOutput;
    readonly summaries?: ReadonlyArray<AWS.ScheduleSummary>;
  } = {},
): { readonly service: AWS.AWSSchedulerService; readonly calls: SchedulerServiceCalls } {
  const calls: SchedulerServiceCalls = { getSchedule: [], listSchedules: [] };

  const service = {
    getSchedule: async (name: string, groupName?: string): Promise<AWS.GetScheduleCommandOutput> => {
      calls.getSchedule.push({ name, groupName });
      return await Promise.resolve(stubs.schedule ?? { $metadata: {} });
    },
    listSchedules: async (filters?: AWS.AWSScheduleListFilters): Promise<AWS.ScheduleSummary[]> => {
      calls.listSchedules.push(filters);
      return await Promise.resolve([...(stubs.summaries ?? [])]);
    },
  } as unknown as AWS.AWSSchedulerService;

  return { service, calls };
}

/** Builds a config, applying the given overrides on top of the defaults. */
function buildConfig(overrides: Partial<AwsScheduleEventbridgeConfig> = {}): AwsScheduleEventbridgeConfig {
  return {
    awsProfiles: ['sso_test'],
    awsRegion: 'eu-south-1',
    action: 'list',
    scheduleGroup: 'default',
    yes: false,
    failOnMissing: false,
    ...overrides,
  };
}

const DISABLE_CONFIG = buildConfig({ action: 'disable', scheduleName: 'nightly-job' });

/** Every `UpdateSchedule` the fleet received, across all profiles. */
function updateCommands(commands: ReadonlyArray<CommandRecord>): ReadonlyArray<CommandRecord> {
  return commands.filter((record) => record.command === 'UpdateScheduleCommand');
}

describe('readSchedules', () => {
  it('classifies every profile in one run and returns them in configuration order', async () => {
    const { script } = createSweepHarness({
      profiles: [
        ['sso_dev', { schedule: scheduleIn('ENABLED') }],
        ['sso_uat', { schedule: scheduleIn('DISABLED') }],
        ['sso_hotfix', {}],
        ['sso_prod', { failWith: new Error('AccessDeniedException') }],
      ],
    });

    const reads = await readSchedules(script, DISABLE_CONFIG);

    assert.deepEqual(
      reads.map((read) => [read.profile, read.status]),
      [
        ['sso_dev', 'found'],
        ['sso_uat', 'found'],
        ['sso_hotfix', 'not-found'],
        ['sso_prod', 'error'],
      ],
    );
    assert.equal(reads[3]?.error?.message, 'AccessDeniedException');
  });

  it('keeps a profile whose account id cannot be resolved', async () => {
    const { script } = createSweepHarness({
      profiles: [['sso_dev', { schedule: scheduleIn('ENABLED'), accountIdFails: true }]],
    });

    const reads = await readSchedules(script, DISABLE_CONFIG);

    assert.equal(reads[0]?.status, 'found');
    assert.equal(reads[0]?.accountId, undefined);
  });

  it('returns one entry per configured profile even when a result vanishes from both maps', async () => {
    const { script } = createSweepHarness({
      profiles: [
        ['sso_dev', { schedule: scheduleIn('ENABLED') }],
        ['sso_uat', { schedule: scheduleIn('ENABLED'), dropResult: true }],
      ],
    });

    const reads = await readSchedules(script, DISABLE_CONFIG);

    assert.equal(reads.length, 2);
    assert.equal(reads[1]?.profile, 'sso_uat');
    assert.equal(reads[1]?.status, 'error');
    assert.match(reads[1]?.error?.message ?? '', /produced no result/);
  });

  it('refuses to run without a schedule name', async () => {
    const { script } = createSweepHarness({ profiles: [['sso_dev', {}]] });

    await assert.rejects(readSchedules(script, buildConfig({ action: 'disable' })), /--schedule-name is required/);
  });
});

describe('confirmScheduleSweep', () => {
  it('answers nothing-to-do without ever prompting when every account already matches', async () => {
    const harness = createSweepHarness({ profiles: [['sso_dev', {}]], confirmResult: true });
    const plan = planScheduleSweep(await readSchedules(harness.script, DISABLE_CONFIG), 'DISABLED');

    const gate = await confirmScheduleSweep(harness.script, DISABLE_CONFIG, plan);

    assert.equal(gate, 'nothing-to-do');
    assert.deepEqual(harness.confirmCalls, []);
  });

  it('answers proceed without prompting when --yes is set', async () => {
    const harness = createSweepHarness({ profiles: [['sso_dev', { schedule: scheduleIn('ENABLED') }]] });
    const plan = planScheduleSweep(await readSchedules(harness.script, DISABLE_CONFIG), 'DISABLED');

    const gate = await confirmScheduleSweep(harness.script, { ...DISABLE_CONFIG, yes: true }, plan);

    assert.equal(gate, 'proceed');
    assert.deepEqual(harness.confirmCalls, []);
  });

  it('treats a refusal and a cancelled prompt alike', async () => {
    for (const confirmResult of [false, undefined]) {
      const harness = createSweepHarness({
        profiles: [['sso_dev', { schedule: scheduleIn('ENABLED') }]],
        ...(confirmResult === undefined ? {} : { confirmResult }),
      });
      const plan = planScheduleSweep(await readSchedules(harness.script, DISABLE_CONFIG), 'DISABLED');

      assert.equal(await confirmScheduleSweep(harness.script, DISABLE_CONFIG, plan), 'cancelled');
      assert.equal(harness.confirmCalls.length, 1);
    }
  });

  it('names the count, the number of accounts and the account names in the question', async () => {
    const harness = createSweepHarness({
      profiles: [
        ['sso_dev', { schedule: scheduleIn('ENABLED') }],
        ['sso_uat', { schedule: scheduleIn('ENABLED') }],
        ['sso_prod', { schedule: scheduleIn('DISABLED') }],
        ['sso_hotfix', {}],
      ],
      confirmResult: true,
    });
    const plan = planScheduleSweep(await readSchedules(harness.script, DISABLE_CONFIG), 'DISABLED');

    await confirmScheduleSweep(harness.script, DISABLE_CONFIG, plan);

    const message = harness.confirmCalls[0] ?? '';
    assert.match(message, /"nightly-job" to DISABLED in 2 of 4 account\(s\)/);
    assert.match(message, /\[sso_dev, sso_uat\]/);
    assert.match(message, /1 account\(s\) do not have it\./);
  });
});

describe('applyScheduleSweep', () => {
  it('writes nothing to the accounts the plan did not select, and never builds their client', async () => {
    const harness = createSweepHarness({
      profiles: [
        ['sso_dev', { schedule: scheduleIn('ENABLED') }],
        ['sso_uat', { schedule: scheduleIn('DISABLED') }],
        ['sso_hotfix', {}],
        ['sso_prod', { failWith: new Error('AccessDeniedException') }],
      ],
    });
    const plan = planScheduleSweep(await readSchedules(harness.script, DISABLE_CONFIG), 'DISABLED');
    harness.commands.length = 0;
    harness.schedulerAccesses.length = 0;

    const mutations = await applyScheduleSweep(harness.script, DISABLE_CONFIG, plan);

    assert.deepEqual(
      mutations.map((mutation) => [mutation.profile, mutation.outcome]),
      [
        ['sso_dev', 'changed'],
        ['sso_uat', 'skipped'],
        ['sso_hotfix', 'skipped'],
        ['sso_prod', 'skipped'],
      ],
    );
    assert.deepEqual(
      updateCommands(harness.commands).map((record) => record.profile),
      ['sso_dev'],
    );
    assert.deepEqual(harness.schedulerAccesses, ['sso_dev']);
  });

  it('reports a failed and a successful write side by side', async () => {
    const harness = createSweepHarness({
      profiles: [
        ['sso_dev', { schedule: scheduleIn('ENABLED') }],
        ['sso_uat', { schedule: scheduleIn('ENABLED'), failUpdate: new Error('ConflictException') }],
      ],
    });
    const plan = planScheduleSweep(await readSchedules(harness.script, DISABLE_CONFIG), 'DISABLED');

    const mutations = await applyScheduleSweep(harness.script, DISABLE_CONFIG, plan);

    assert.deepEqual(
      mutations.map((mutation) => mutation.outcome),
      ['changed', 'failed'],
    );
    assert.equal(mutations[1]?.error?.message, 'ConflictException');
  });

  it('reports a schedule moved between the preview and the write as unchanged', async () => {
    const harness = createSweepHarness({
      profiles: [['sso_dev', { schedule: scheduleIn('ENABLED'), rereadAs: scheduleIn('DISABLED') }]],
    });
    const plan = planScheduleSweep(await readSchedules(harness.script, DISABLE_CONFIG), 'DISABLED');

    const mutations = await applyScheduleSweep(harness.script, DISABLE_CONFIG, plan);

    assert.equal(mutations[0]?.outcome, 'unchanged');
    assert.deepEqual(updateCommands(harness.commands), []);
  });

  it('sends back every writable field, changing only State', async () => {
    const harness = createSweepHarness({
      profiles: [['sso_dev', { schedule: scheduleIn('ENABLED') }]],
    });
    const plan = planScheduleSweep(await readSchedules(harness.script, DISABLE_CONFIG), 'DISABLED');

    await applyScheduleSweep(harness.script, DISABLE_CONFIG, plan);

    const input = updateCommands(harness.commands)[0]?.input;
    assert.equal(input?.['State'], 'DISABLED');
    assert.equal(input?.['Description'], 'Nightly reconciliation job');
    assert.equal(input?.['ScheduleExpression'], 'cron(0 2 * * ? *)');
    assert.deepEqual(input?.['Target'], scheduleIn('ENABLED').Target);
  });

  it('refuses to run without a schedule name', async () => {
    const harness = createSweepHarness({ profiles: [['sso_dev', { schedule: scheduleIn('ENABLED') }]] });
    const plan = planScheduleSweep(await readSchedules(harness.script, DISABLE_CONFIG), 'DISABLED');

    await assert.rejects(
      applyScheduleSweep(harness.script, buildConfig({ action: 'disable' }), plan),
      /--schedule-name is required/,
    );
  });
});

describe('runScheduleSweep', () => {
  it('writes to no account at all when the confirmation is refused', async () => {
    const harness = createSweepHarness({
      profiles: [
        ['sso_dev', { schedule: scheduleIn('ENABLED') }],
        ['sso_uat', { schedule: scheduleIn('ENABLED') }],
      ],
      confirmResult: false,
    });

    await runScheduleSweep(harness.script, DISABLE_CONFIG, 'DISABLED');

    assert.deepEqual(updateCommands(harness.commands), []);
    assert.ok(harness.calls.some((call) => call.payload === 'Operation cancelled by user.'));
  });

  it('exits zero on a cancelled run even when an account could not be read', async () => {
    const harness = createSweepHarness({
      profiles: [
        ['sso_dev', { schedule: scheduleIn('ENABLED') }],
        ['sso_uat', { failWith: new Error('AccessDeniedException') }],
      ],
      confirmResult: false,
    });

    await runScheduleSweep(harness.script, DISABLE_CONFIG, 'DISABLED');

    assert.deepEqual(updateCommands(harness.commands), []);
  });

  it('updates the healthy account and still throws when another one failed to read', async () => {
    const harness = createSweepHarness({
      profiles: [
        ['sso_dev', { failWith: new Error('AccessDeniedException') }],
        ['sso_uat', { schedule: scheduleIn('ENABLED') }],
      ],
      confirmResult: true,
    });

    await assert.rejects(runScheduleSweep(harness.script, DISABLE_CONFIG, 'DISABLED'), /did not converge/);

    assert.deepEqual(
      updateCommands(harness.commands).map((record) => record.profile),
      ['sso_uat'],
    );
  });

  it('throws without prompting when no account can be read at all', async () => {
    const harness = createSweepHarness({
      profiles: [
        ['sso_dev', { failWith: new Error('AccessDeniedException') }],
        ['sso_uat', { failWith: new Error('AccessDeniedException') }],
      ],
      confirmResult: true,
    });

    await assert.rejects(runScheduleSweep(harness.script, DISABLE_CONFIG, 'DISABLED'), /did not converge/);

    assert.deepEqual(harness.confirmCalls, []);
    assert.deepEqual(updateCommands(harness.commands), []);
  });

  it('treats a missing schedule as drift by default and as a failure under --fail-on-missing', async () => {
    const profiles: ReadonlyArray<readonly [string, ProfileFixture]> = [
      ['sso_dev', { schedule: scheduleIn('DISABLED') }],
      ['sso_uat', {}],
    ];

    const tolerant = createSweepHarness({ profiles, confirmResult: true });
    await runScheduleSweep(tolerant.script, DISABLE_CONFIG, 'DISABLED');
    assert.deepEqual(updateCommands(tolerant.commands), []);

    const strict = createSweepHarness({ profiles, confirmResult: true });
    await assert.rejects(
      runScheduleSweep(strict.script, { ...DISABLE_CONFIG, failOnMissing: true }, 'DISABLED'),
      /did not converge/,
    );
  });

  it('reports a converged fleet with a success line', async () => {
    const harness = createSweepHarness({
      profiles: [
        ['sso_dev', { schedule: scheduleIn('ENABLED') }],
        ['sso_uat', { schedule: scheduleIn('DISABLED') }],
      ],
      confirmResult: true,
    });

    await runScheduleSweep(harness.script, DISABLE_CONFIG, 'DISABLED');

    const success = harness.calls.find((call) => call.method === 'success')?.payload;
    assert.match(String(success), /1 changed, 1 unchanged, 0 pending, 0 missing, 0 failed of 2 account\(s\)\./);
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
    const { service, calls: serviceCalls } = createMockSchedulerService({ schedule: scheduleIn('ENABLED') });

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
