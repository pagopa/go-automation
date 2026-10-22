import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResultField } from '@go-automation/go-common/aws';
import { GOLogger } from '@go-automation/go-common/core';
import type { RunbookOutput } from '../../../../output/RunbookOutput.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { executeRunbookForOccurrence } from '../../../executeRunbookForOccurrence.js';
import { ERROR_QUERY, SPIDHUB_ACCOUNT_ID, SPIDHUB_ALARM, SPIDHUB_REGION, STREAM_QUERY } from '../alarmDefinition.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;
type ReadQueryFn = (query: string) => Rows;
const HEADERS_ERROR = 'Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent';
const RESPONDER_ERROR =
  '[io-spid-commons] Spid Authentication|Authentication Error|ERROR=Error: Value attribute of StatusCode is invalid: urn:oasis:names:tc:SAML:2.0:status:Responder';

async function execute(read: ReadQueryFn): Promise<RunbookOutput> {
  return executeRunbookForOccurrence(
    {
      logger: new GOLogger(),
      services: createTestServiceRegistry({
        cloudWatchLogs: {
          forTarget() {
            return {
              // eslint-disable-next-line @typescript-eslint/require-await
              async query(_groups: ReadonlyArray<string>, query: string) {
                return read(query);
              },
            };
          },
        },
      }),
    },
    {
      alarmName: SPIDHUB_ALARM,
      firedAt: '2026-09-18T08:52:13Z',
      awsAccountId: SPIDHUB_ACCOUNT_ID,
      region: SPIDHUB_REGION,
      awsProfiles: [],
      executionMode: 'cloud',
    },
  );
}

function errorRow(message: string, timestamp = '2026-09-18T08:52:13Z'): Rows[number] {
  return [
    { field: '@timestamp', value: timestamp },
    { field: '@logStream', value: 'task-1' },
    { field: '@message', value: message },
  ];
}

function streamRow(lastLog = '2026-09-18T08:55:00Z'): Rows[number] {
  return [
    { field: '@logStream', value: 'task-1' },
    { field: 'firstLog', value: '2026-09-18T08:48:00Z' },
    { field: 'lastLog', value: lastLog },
    { field: 'logCount', value: '42' },
  ];
}

describe('SPID Hub occurrence output', () => {
  it('exports diagnostic counts and raw error/stream evidence through cloud execution', async () => {
    const output = await execute((query) =>
      query === ERROR_QUERY ? [errorRow(HEADERS_ERROR), errorRow(RESPONDER_ERROR)] : [streamRow()],
    );
    assert.strictEqual(output.execution.status, 'completed');
    assert.strictEqual(output.outcome.kind, 'known-case-matched');
    assert.deepStrictEqual(Object.fromEntries(output.context.fields.map(({ name, value }) => [name, value])), {
      alarmName: SPIDHUB_ALARM,
      spidHubDiagnostics: 'COLLECTED',
      spidHubErrorLogCount: '2',
      spidHubStreamCount: '1',
      spidHubResponderCount: '1',
      spidHubHeadersSentCount: '1',
    });
    assert.deepStrictEqual(output.context.evidence, [
      {
        id: 'spidhub-errors',
        label: 'Errori applicativi SPID Hub',
        type: 'log-sample',
        sourceStep: 'query-spidhub-diagnostics',
        items: [HEADERS_ERROR, RESPONDER_ERROR].map((message) => ({
          '@timestamp': '2026-09-18T08:52:13Z',
          '@logStream': 'task-1',
          '@message': message,
          timestamp: '2026-09-18T08:52:13Z',
          message,
          sourceAccountId: SPIDHUB_ACCOUNT_ID,
          queryKind: 'errors',
        })),
        truncated: false,
      },
      {
        id: 'spidhub-streams',
        label: 'Stream applicativi SPID Hub',
        type: 'step-output',
        sourceStep: 'query-spidhub-diagnostics',
        items: [
          {
            '@logStream': 'task-1',
            firstLog: '2026-09-18T08:48:00Z',
            lastLog: '2026-09-18T08:55:00Z',
            logCount: '42',
            sourceAccountId: SPIDHUB_ACCOUNT_ID,
            queryKind: 'streams',
          },
        ],
        truncated: false,
      },
    ]);
    assert.strictEqual(
      (output.context.details?.['diagnostics'] as Record<string, unknown> | undefined)?.['spidHubErrorLogCount'],
      2,
    );
    assert.strictEqual(
      (output.context.details?.['diagnostics'] as Record<string, unknown> | undefined)?.['spidHubStreamCount'],
      1,
    );
    assert.strictEqual(
      (output.context.details?.['diagnostics'] as Record<string, unknown> | undefined)?.['spidHubResponderCount'],
      1,
    );
    assert.strictEqual(
      (output.context.details?.['diagnostics'] as Record<string, unknown> | undefined)?.['spidHubHeadersSentCount'],
      1,
    );
    assert.strictEqual(
      (output.context.details?.['metadata'] as Record<string, unknown> | undefined)?.['albCorrelation'],
      'MANUAL',
    );
    assert.deepStrictEqual(output.context.details?.['alarm'], {
      name: SPIDHUB_ALARM,
      datetime: '2026-09-18T08:52:13Z',
      timeRange: { start: '2026-09-18T08:47:13.000Z', end: '2026-09-18T08:57:13.000Z' },
    });
  });

  it('preserves evidence for errors that do not match a known case', async () => {
    const output = await execute((query) => (query === ERROR_QUERY ? [errorRow('Unexpected error')] : [streamRow()]));
    assert.strictEqual(output.outcome.kind, 'unknown-case');
    assert.strictEqual(output.context.evidence.length, 2);
    assert.strictEqual(
      (output.context.details?.['diagnostics'] as Record<string, unknown> | undefined)?.['spidHubErrorLogCount'],
      1,
    );
  });

  it('exports zero counts with no evidence when both queries return no rows', async () => {
    const output = await execute(() => []);
    assert.strictEqual(output.outcome.kind, 'unknown-case');
    assert.deepStrictEqual(output.context.evidence, []);
    for (const field of output.context.fields.filter(({ name }) => name.endsWith('Count'))) {
      assert.strictEqual(field.value, '0');
    }
    assert.strictEqual(
      (output.context.details?.['diagnostics'] as Record<string, unknown> | undefined)?.['spidHubDiagnostics'],
      'COLLECTED',
    );
  });

  it('bounds each sample independently and retains full counts and the newest timestamps', async () => {
    const output = await execute((query) =>
      Array.from({ length: 7 }, (_, index) => {
        const timestamp = `2026-09-18T08:5${String(index)}:00Z`;
        return query === ERROR_QUERY ? errorRow('Unexpected error', timestamp) : streamRow(timestamp);
      }),
    );
    for (const evidence of output.context.evidence) {
      assert.strictEqual(evidence.items?.length, 5);
      assert.strictEqual(evidence.truncated, true);
      const field = evidence.id === 'spidhub-errors' ? '@timestamp' : 'lastLog';
      assert.strictEqual(evidence.items?.[0]?.[field], '2026-09-18T08:52:00Z');
      assert.strictEqual(evidence.items?.[4]?.[field], '2026-09-18T08:56:00Z');
    }
    assert.strictEqual(
      (output.context.details?.['diagnostics'] as Record<string, unknown> | undefined)?.['spidHubErrorLogCount'],
      7,
    );
    assert.strictEqual(
      (output.context.details?.['diagnostics'] as Record<string, unknown> | undefined)?.['spidHubStreamCount'],
      7,
    );
  });

  it('does not publish partial evidence or diagnostic counts if a query fails', async () => {
    const output = await execute((query) => {
      if (query === STREAM_QUERY) throw new Error('AccessDenied');
      return [errorRow(HEADERS_ERROR)];
    });
    assert.strictEqual(output.outcome.kind, 'failed');
    assert.deepStrictEqual(output.context.evidence, []);
    assert.deepStrictEqual(
      output.context.fields.map(({ name }) => name),
      ['alarmName'],
    );
    assert.strictEqual(
      (output.context.details?.['diagnostics'] as Record<string, unknown> | undefined)?.['spidHubDiagnostics'],
      undefined,
    );
    assert.strictEqual(
      (output.context.details?.['diagnostics'] as Record<string, unknown> | undefined)?.['spidHubErrorLogCount'],
      undefined,
    );
  });
});
