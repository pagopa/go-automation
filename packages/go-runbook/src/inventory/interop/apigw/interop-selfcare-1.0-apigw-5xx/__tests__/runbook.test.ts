import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { apigw } from '../../../../../toolkits/interop/index.js';
import { executeAlarmWithLogs } from '../../../shared/__tests__/helpers/runbookExecution.js';
import type { LogRows } from '../../../../../__tests__/helpers/LogRows.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { buildRunbook } from '../runbook.js';

function row(fields: Readonly<Record<string, string>>): LogRows[number] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

async function execute(access: LogRows, application: LogRows = []): Promise<RunbookLogsExecution> {
  return executeAlarmWithLogs(buildRunbook(), 'interop-selfcare-1.0-prod-apigw-5xx', (_query, logGroups) =>
    logGroups[0]?.startsWith('amazon-apigateway') === true ? access : application,
  );
}

describe('INTEROP Selfcare API Gateway 5xx runbook', () => {
  it('matches an API Gateway-only timeout and exposes it as output evidence', async () => {
    const { result, matchedIds } = await execute([
      row({
        latestTimestamp: '2026-08-24 09:10:00.000',
        count: '1',
        status: '504',
        integrationError: 'Execution failed due to a timeout error',
      }),
    ]);
    assert.deepStrictEqual(matchedIds, ['api-gateway-backend-timeout-504']);
    const output = apigw.buildApiGwOutputContext(buildRunbook(), result);
    assert.match(JSON.stringify(output?.evidence), /Execution failed due to a timeout error/u);
  });

  it('reports both an actionable IAM failure and a benign SelfcareID suppression', async () => {
    const { matchedIds } = await execute(
      [row({ count: '1', status: '500', httpMethod: 'GET', requestPath: '/1.0/backend-for-frontend/catalog' })],
      [
        row({
          pod_app: 'interop-be-backend-for-frontend',
          cid: 'iam-cid',
          '@message':
            '[CID=iam-cid] User arn:aws:iam::123:role/bff is not authorized to perform: s3:ListBucket ' +
            'because no identity-based policy allows the s3:ListBucket action',
        }),
        row({
          pod_app: 'interop-be-backend-for-frontend',
          cid: 'selfcare-cid',
          '@message': '[CID=selfcare-cid] Tenant with selfcareId 56f4f576-af5e-4a90-8be2-1ac78dec899f not found',
        }),
      ],
    );
    assert.deepStrictEqual(matchedIds, ['tenant-not-found-known-selfcare-id', 'bff-s3-list-bucket-not-authorized']);
  });
});
