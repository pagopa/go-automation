import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';
import type { AWS } from '@go-automation/go-common';

import type { GoReportAlarmsConfig } from '../../types/GoReportAlarmsConfig.js';

import { fetchAlarms } from '../fetchAlarms.js';

interface FakeDescribeAlarmHistoryInput {
  readonly AlarmName?: string;
  readonly StartDate?: Date;
  readonly EndDate?: Date;
  readonly HistoryItemType?: string;
}

interface FakeScriptHarness {
  readonly script: Core.GOScript;
  readonly calls: { readonly profile: string; readonly input: FakeDescribeAlarmHistoryInput }[];
  readonly warnings: string[];
}

type ProfileResponderFn = (
  profile: string,
  input: FakeDescribeAlarmHistoryInput,
) => ReadonlyArray<AWS.AlarmHistoryItem> | Promise<ReadonlyArray<AWS.AlarmHistoryItem>>;

type MultiProfileOperationFn<T> = (profile: string, clients: AWS.AWSClientProvider) => Promise<T>;

const CONFIG: GoReportAlarmsConfig = {
  startDate: '2025-01-01T00:00:00Z',
  endDate: '2025-01-31T23:59:59Z',
  alarmName: undefined,
  ignorePatterns: [],
  verbose: false,
  awsProfiles: undefined,
};

function createFakeScript(profiles: ReadonlyArray<string>, responder: ProfileResponderFn): FakeScriptHarness {
  const calls: { readonly profile: string; readonly input: FakeDescribeAlarmHistoryInput }[] = [];
  const warnings: string[] = [];
  const clients = {
    profileNames: profiles,
    async mapParallelSettled<T>(
      operation: MultiProfileOperationFn<T>,
    ): Promise<{ readonly results: Map<string, T>; readonly errors: Map<string, Error> }> {
      const settled = await Promise.all(
        profiles.map(async (profile) => {
          const clientProvider = {
            cloudWatch: {
              async send(
                command: unknown,
              ): Promise<{ readonly AlarmHistoryItems: ReadonlyArray<AWS.AlarmHistoryItem> }> {
                const input = (command as { readonly input: FakeDescribeAlarmHistoryInput }).input;
                calls.push({ profile, input });
                return { AlarmHistoryItems: await responder(profile, input) };
              },
            },
          } as unknown as AWS.AWSClientProvider;
          try {
            return { profile, result: await operation(profile, clientProvider) };
          } catch (error) {
            return { profile, error: error instanceof Error ? error : new Error(String(error)) };
          }
        }),
      );
      const results = new Map<string, T>();
      const errors = new Map<string, Error>();
      for (const entry of settled) {
        if ('error' in entry) errors.set(entry.profile, entry.error);
        else results.set(entry.profile, entry.result);
      }
      return { results, errors };
    },
  };
  const script = {
    aws: { clients },
    logger: {
      section() {},
      info() {},
      text() {},
      newline() {},
      warning(message: string) {
        warnings.push(message);
      },
    },
    prompt: {
      setSpinnerIndent() {},
      startSpinner() {},
      updateSpinner() {},
      spinnerStop() {},
    },
  } as unknown as Core.GOScript;

  return { script, calls, warnings };
}

describe('fetchAlarms', () => {
  it('queries every configured provider profile and deduplicates the aggregated items', async () => {
    const item: AWS.AlarmHistoryItem = {
      AlarmName: 'shared-alarm',
      Timestamp: new Date('2025-01-10T12:00:00Z'),
      HistoryItemType: 'Action',
    };
    const { script, calls } = createFakeScript(['dev', 'uat'], () => [item]);

    const result = await fetchAlarms(script, { ...CONFIG, alarmName: 'shared-alarm' });

    assert.deepStrictEqual(result, [item]);
    assert.deepStrictEqual(
      calls.map(({ profile }) => profile),
      ['dev', 'uat'],
    );
    for (const { input } of calls) {
      assert.strictEqual(input.AlarmName, 'shared-alarm');
      assert.strictEqual(input.HistoryItemType, 'Action');
      assert.strictEqual(input.StartDate?.toISOString(), new Date(CONFIG.startDate).toISOString());
      assert.strictEqual(input.EndDate?.toISOString(), new Date(CONFIG.endDate).toISOString());
    }
  });

  it('keeps successful results when another profile fails', async () => {
    const item: AWS.AlarmHistoryItem = { AlarmName: 'dev-alarm' };
    const { script, warnings } = createFakeScript(['dev', 'uat'], (profile) => {
      if (profile === 'uat') throw new Error('Expired credentials');
      return [item];
    });

    const result = await fetchAlarms(script, CONFIG);

    assert.deepStrictEqual(result, [item]);
    assert.ok(warnings.some((message) => message.includes('1 profiles failed')));
  });

  it('fails when no profile query succeeds', async () => {
    const { script } = createFakeScript(['dev', 'uat'], () => {
      throw new Error('Service unavailable');
    });

    await assert.rejects(fetchAlarms(script, CONFIG), /All profile queries failed/);
  });
});
