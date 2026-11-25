import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { StepResult } from '../../../../../../engine/types/StepResult.js';
import type { ApiGwErrorInfo } from '../../accessLog/ApiGwErrorInfo.js';
import { ParseApiGwErrorsStep } from '../ParseApiGwErrorsStep.js';
import { SEND_API_GW_PROFILE } from '../../../../../send/families/apigw/profiles/SEND_API_GW_PROFILE.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';

/** Parses the access-log rows with the SEND profile (the step has no product default). */
async function parse(
  rows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>,
  options: { readonly minStatusCode?: number; readonly fromStep?: string } = {},
): Promise<StepResult<ApiGwErrorInfo>> {
  const step = new ParseApiGwErrorsStep({
    schema: SEND_API_GW_PROFILE.accessLog.schema,
    queryProfileId: SEND_API_GW_PROFILE.id,
    id: 'parse',
    label: 'Parse',
    fromStep: options.fromStep ?? 'query-api-gw-logs',
    ...(options.minStatusCode === undefined ? {} : { minStatusCode: options.minStatusCode }),
  });
  return step.execute(createTestContext({ stepResults: { 'query-api-gw-logs': rows } }));
}

describe('parseApiGwErrors', () => {
  it('stops with apiGwErrorCount=0 when no status field meets the threshold', async () => {
    for (const fields of [
      { status: '200' },
      { status: '404', authorizerStatus: '200', integrationServiceStatus: '-' },
    ]) {
      const result = await parse([logRow(fields)]);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.next, 'stop');
      assert.strictEqual(result.vars?.['apiGwErrorCount'], '0');
    }
  });

  it("extracts every field of the first error row, keeping the '-' placeholder out of the typed output", async () => {
    const result = await parse([
      logRow({
        status: '500',
        xrayTraceId: 'Root=1-abc-def',
        requestId: 'req-123',
        authorizerRequestId: 'auth-789',
        integrationRequestId: '-',
        errorMessage: 'Internal server error',
        httpMethod: 'PUT',
        path: '/v1/foo',
        authorizerStatus: '-',
        authorizerLatency: '5011',
        integrationServiceStatus: '-',
      }),
    ]);

    assert.strictEqual(result.success, true);
    for (const [name, value] of Object.entries({
      apiGwStatusCode: '500',
      xRayTraceId: '1-abc-def',
      apiGwErrorMessage: 'Internal server error',
      apiGwHttpMethod: 'PUT',
      apiGwPath: '/v1/foo',
      apiGwAuthorizerRequestId: 'auth-789',
      apiGwAuthorizerLatency: '5011',
      apiGwIntegrationRequestId: '-',
      apiGwIntegrationServiceStatus: '-',
      apiGwRequestId: 'req-123',
    })) {
      assert.strictEqual(result.vars?.[name], value, name);
    }
    assert.strictEqual(result.output?.integrationRequestId, undefined);
    assert.strictEqual(result.output?.errorMessage, 'Internal server error');
  });

  it('filters rows below the configured threshold', async () => {
    const result = await parse([logRow({ status: '404' }), logRow({ status: '503', xrayTraceId: 'Root=1-x' })], {
      minStatusCode: 500,
    });
    assert.strictEqual(result.vars?.['apiGwErrorCount'], '1');
    assert.strictEqual(result.vars?.['apiGwStatusCode'], '503');
  });

  it('uses the highest status row as primary diagnostic when 4xx and 5xx rows are mixed', async () => {
    const result = await parse(
      [
        logRow({ status: '403', xrayTraceId: 'Root=1-403', errorMessage: 'Forbidden', path: '/forbidden' }),
        logRow({
          status: '500',
          xrayTraceId: 'Root=1-500',
          errorMessage: 'Internal server error',
          path: '/server-error',
        }),
      ],
      { minStatusCode: 400 },
    );

    assert.strictEqual(result.vars?.['apiGwErrorCount'], '2');
    assert.strictEqual(result.vars?.['apiGwStatusCode'], '500');
    assert.strictEqual(result.vars?.['xRayTraceId'], '1-500');
    assert.strictEqual(result.vars?.['apiGwErrorMessage'], 'Internal server error');
    assert.strictEqual(result.vars?.['apiGwPath'], '/server-error');
  });

  it('keeps rows whose only error signal is on authorizerStatus or integrationServiceStatus', async () => {
    const result = await parse([
      logRow({ status: '-', authorizerStatus: '500', integrationServiceStatus: '-', xrayTraceId: 'Root=1-aaa' }),
      logRow({ status: '-', authorizerStatus: '-', integrationServiceStatus: '503', xrayTraceId: 'Root=1-bbb' }),
    ]);
    assert.strictEqual(result.success, true);
    assert.notStrictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['apiGwErrorCount'], '2');
    // With severity ordering, the 503 integration error becomes the primary diagnostic.
    assert.strictEqual(result.vars?.['apiGwStatusCode'], '503');
  });

  it('reads apiGwStatusCode from status first, then authorizerStatus, then integrationServiceStatus', async () => {
    for (const [fields, expected] of [
      [{ status: '-', authorizerStatus: '-', integrationServiceStatus: '502' }, '502'],
      [{ status: '500', authorizerStatus: '401', integrationServiceStatus: '503' }, '500'],
    ] as const) {
      const result = await parse([logRow(fields)]);
      assert.strictEqual(result.vars?.['apiGwStatusCode'], expected);
    }
  });

  it('returns failure when the upstream step output is missing', async () => {
    const result = await parse([logRow({ status: '500' })], { fromStep: 'missing-step' });
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Step output not found/);
  });
});
