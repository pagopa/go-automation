import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSCloudWatchLogsTimeRange } from '@pagopa/go-aws/cloudwatch-logs';

import { executeAlarmWithLogs } from '../../../shared/__tests__/helpers/runbookExecution.js';
import type { LogsResponderFn } from '../../../../../__tests__/helpers/LogsResponderFn.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { buildRunbook } from '../runbook.js';

const isAccessLog = (logGroups: ReadonlyArray<string>): boolean =>
  logGroups[0]?.startsWith('amazon-apigateway') === true;

/** Executes the prod alarm fired at 10:00 with the X-2/X+1 window. */
async function execute(respond: LogsResponderFn): Promise<RunbookLogsExecution> {
  return executeAlarmWithLogs(buildRunbook(), 'interop-auth-server-prod-apigw-4xx', respond, {
    alarmDatetime: '2026-08-24T10:00:00.000Z',
    startTime: '2026-08-24T09:58:00.000Z',
    endTime: '2026-08-24T10:01:00.000Z',
  });
}

describe('INTEROP auth-server 4xx runbook', () => {
  it('uses X-2/X+1 for APIGW and CID but X-2/X for auth-server warnings', async () => {
    const ranges: AWSCloudWatchLogsTimeRange[] = [];
    await execute((query, logGroups, range) => {
      ranges.push(range);
      if (isAccessLog(logGroups)) {
        return [
          [
            { field: 'count', value: '1' },
            { field: 'status', value: '400' },
          ],
        ];
      }
      return query.includes('stats count(*)')
        ? [
            [
              { field: 'count', value: '1' },
              { field: 'cid', value: 'cid-1' },
              { field: 'errorMessage', value: 'unclassified warning' },
            ],
          ]
        : [];
    });

    assert.deepStrictEqual(
      ranges.map(({ end }) => end.toISOString()),
      ['2026-08-24T10:01:00.000Z', '2026-08-24T10:00:00.000Z', '2026-08-24T10:01:00.000Z'],
    );
  });

  it('recognizes an API Gateway 403 even when no application warning was found', async () => {
    const { matchedIds } = await execute((_query, logGroups) =>
      isAccessLog(logGroups)
        ? [
            [
              { field: 'latestTimestamp', value: '2026-08-24 10:00:00.000' },
              { field: 'count', value: '2' },
              { field: 'status', value: '403' },
              { field: 'httpMethod', value: 'GET' },
              { field: 'requestPath', value: '/token.oauth2' },
            ],
          ]
        : [],
    );
    assert.deepStrictEqual(matchedIds, ['INTEROP_APIGW_IASA4_AUT-SER-API-GAT-FOR-403']);
  });
});
