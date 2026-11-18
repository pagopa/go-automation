import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { AnalyzeInteropApiGwAggregatesStep } from '../AnalyzeInteropApiGwAggregatesStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

const step = new AnalyzeInteropApiGwAggregatesStep({
  id: 'analyze',
  label: 'Analyze',
  fromStep: 'query',
  errorFamilyLabel: '4xx',
});

async function analyze(rows: ReadonlyArray<GOLogsInsightsResultField[]>): ReturnType<typeof step.execute> {
  return step.execute(createTestContext({ stepResults: { query: rows } }));
}

describe('AnalyzeInteropApiGwAggregatesStep', () => {
  it('sums aggregate counts and keeps representative fields from the dominant row', async () => {
    const result = await analyze([
      logRow({ count: '1', status: '401', integrationError: 'zeta', httpMethod: 'GET', requestPath: '/minor' }),
      logRow({
        count: '20',
        status: '429',
        integrationError: 'dominant',
        httpMethod: 'POST',
        requestPath: '/dominant',
        sourceIp: '203.0.113.20',
      }),
    ]);

    assert.strictEqual(result.output?.errorCount, 21);
    assert.deepStrictEqual(result.output?.integrationErrors, ['dominant', 'zeta']);
    assert.deepStrictEqual(
      ['apiGwStatusCode', 'apiGwErrorMessage', 'apiGwHttpMethod', 'apiGwPath', 'apiGwSourceIp'].map(
        (k) => result.vars?.[k],
      ),
      ['429', 'dominant', 'POST', '/dominant', '203.0.113.20'],
    );
  });

  it('uses a deterministic representative row when aggregate counts are tied', async () => {
    const first = logRow({
      count: '10',
      status: '429',
      integrationError: 'zeta',
      httpMethod: 'POST',
      requestPath: '/zeta',
    });
    const second = logRow({
      count: '10',
      status: '401',
      integrationError: 'alpha',
      httpMethod: 'GET',
      requestPath: '/alpha',
    });

    const forward = await analyze([first, second]);
    const reverse = await analyze([second, first]);

    assert.deepStrictEqual(forward.output, reverse.output);
    assert.deepStrictEqual(forward.vars, reverse.vars);
    assert.deepStrictEqual(forward.output?.integrationErrors, ['alpha', 'zeta']);
    assert.deepStrictEqual(
      ['apiGwStatusCode', 'apiGwErrorMessage', 'apiGwHttpMethod', 'apiGwPath'].map((k) => forward.vars?.[k]),
      ['401', 'alpha', 'GET', '/alpha'],
    );
  });

  it('drops API Gateway placeholder values from the analysis and representative variables', async () => {
    const result = await analyze([
      logRow({
        count: '2',
        status: '403',
        integrationStatus: '-',
        integrationError: ' - ',
        httpMethod: 'GET',
        requestPath: '/token.oauth2',
        sourceIp: '-',
      }),
    ]);

    assert.deepStrictEqual(result.output?.integrationStatuses, []);
    assert.deepStrictEqual(result.output?.integrationErrors, []);
    assert.deepStrictEqual(result.output?.sourceIps, []);
    assert.deepStrictEqual(
      ['apiGwIntegrationStatus', 'apiGwErrorMessage', 'apiGwSourceIp'].map((k) => result.vars?.[k]),
      ['', '', ''],
    );
  });
});
