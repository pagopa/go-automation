import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';
import type { AWS } from '@go-automation/go-common';

import type { AlarmTimelineEntry } from '../../types/alarms.types.js';
import type { GoReportAlarmsConfig } from '../../types/GoReportAlarmsConfig.js';
import type { MultiProfileQueryResult } from '../../types/MultiProfileQueryResult.js';

import { AlarmAnalyzer } from '../AlarmAnalyzer.js';
import {
  displayAnalyzableSummary,
  displayDetailedTimeline,
  displayIgnoredAlarmsReport,
  displayProfileSummary,
} from '../displayReports.js';

interface LoggerCall {
  readonly method: string;
  readonly message?: string;
}

const CONFIG: GoReportAlarmsConfig = {
  startDate: '2026-07-01T00:00:00.000Z',
  endDate: '2026-07-02T00:00:00.000Z',
  alarmName: undefined,
  ignorePatterns: [],
  verbose: false,
  awsProfiles: ['prod'],
};

function createScript(): { readonly script: Core.GOScript; readonly calls: LoggerCall[] } {
  const calls: LoggerCall[] = [];
  const script = {
    logger: {
      section(message: string) {
        calls.push({ method: 'section', message });
      },
      info(message: string) {
        calls.push({ method: 'info', message });
      },
      warning(message: string) {
        calls.push({ method: 'warning', message });
      },
      text(message: string) {
        calls.push({ method: 'text', message });
      },
      newline() {
        calls.push({ method: 'newline' });
      },
    },
  } as unknown as Core.GOScript;

  return { script, calls };
}

function messages(calls: ReadonlyArray<LoggerCall>, method?: string): ReadonlyArray<string> {
  return calls
    .filter((call) => method === undefined || call.method === method)
    .map((call) => call.message)
    .filter((message): message is string => message !== undefined);
}

function alarm(name: string, timestamp = '2026-07-01T12:00:00.000Z'): AWS.AlarmHistoryItem {
  return { AlarmName: name, Timestamp: new Date(timestamp) };
}

describe('displayReports', () => {
  it('renders the multi-profile query summary including successful and failed profiles', () => {
    const { script, calls } = createScript();
    const result: MultiProfileQueryResult = {
      items: [],
      totalItemCount: 3,
      successfulProfiles: [{ status: 'success', profile: 'prod', items: [], itemCount: 3 }],
      failedProfiles: [{ status: 'failure', profile: 'att', error: new Error('Expired credentials') }],
      allSucceeded: false,
      profileCount: 2,
    };

    displayProfileSummary(script, result);

    assert.deepStrictEqual(messages(calls, 'section'), ['Profile Query Summary']);
    assert.ok(messages(calls, 'text').includes('  [OK] prod: 3 items'));
    assert.ok(messages(calls, 'text').includes('  [FAIL] att: Expired credentials'));
    assert.ok(messages(calls, 'info').includes('Totals: 1/2 profiles successful, 3 total items'));
  });

  it('renders ignored alarms reports for empty and non-empty input', () => {
    const analyzer = new AlarmAnalyzer();
    const empty = createScript();
    displayIgnoredAlarmsReport(empty.script, analyzer, []);

    assert.deepStrictEqual(messages(empty.calls, 'section'), ['No Alarms Ignored']);

    const nonEmpty = createScript();
    displayIgnoredAlarmsReport(nonEmpty.script, analyzer, [alarm('ignored-b'), alarm('ignored-a'), alarm('ignored-a')]);

    assert.deepStrictEqual(messages(nonEmpty.calls, 'section'), ['Ignored Alarms Report']);
    assert.deepStrictEqual(messages(nonEmpty.calls, 'text'), ['[2] ignored-a', '[1] ignored-b']);
    assert.ok(messages(nonEmpty.calls, 'info').includes('Total Ignored: 3'));
  });

  it('renders the analyzable summary total', () => {
    const { script, calls } = createScript();

    displayAnalyzableSummary(script, new AlarmAnalyzer(), [
      { alarmName: 'alarm-a', count: 2 },
      { alarmName: 'alarm-b', count: 1 },
    ]);

    assert.deepStrictEqual(messages(calls, 'section'), ['Analyzable Alarms Report']);
    assert.deepStrictEqual(messages(calls, 'text'), ['[2] alarm-a', '[1] alarm-b']);
    assert.ok(messages(calls, 'info').includes('Total Analyzable: 3'));
  });

  it('renders compact and verbose detailed timelines', () => {
    const timeline: ReadonlyArray<AlarmTimelineEntry> = [
      {
        alarmName: 'alarm-a',
        timestamps: [
          new Date('2026-07-01T12:00:00.000Z'),
          new Date('2026-07-01T11:00:00.000Z'),
          new Date('2026-07-01T10:00:00.000Z'),
        ],
      },
    ];

    const compact = createScript();
    displayDetailedTimeline(compact.script, { ...CONFIG, verbose: false }, timeline);

    assert.deepStrictEqual(messages(compact.calls, 'section'), ['Analyzable Alarms Details']);
    assert.ok(messages(compact.calls, 'text').includes('[3] alarm-a'));
    assert.ok(
      messages(compact.calls, 'text').some((message) => message.startsWith(' - Last:  2026-07-01T12:00:00.000Z')),
    );
    assert.ok(
      messages(compact.calls, 'text').some((message) => message.startsWith(' - First: 2026-07-01T10:00:00.000Z')),
    );

    const verbose = createScript();
    displayDetailedTimeline(verbose.script, { ...CONFIG, verbose: true }, timeline);

    assert.ok(messages(verbose.calls, 'text').includes('  - 2026-07-01T11:00:00.000Z - (01/07/2026 11.00.00)'));
  });
});
