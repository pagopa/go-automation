import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createLambdaAlarmRunbook } from '../../builders/createLambdaAlarmRunbook.js';
import { buildLambdaOutputContext } from '../buildLambdaOutputContext.js';
import { DEFAULT_LAMBDA_PROFILE } from '../../profiles/DEFAULT_LAMBDA_PROFILE.js';
import { createTestExecutionResult } from '../../../../../../__tests__/helpers/createTestExecutionResult.js';
import { createTestRunbook } from '../../../../../../__tests__/helpers/createTestRunbook.js';
import { messageRow } from '../../../../../../__tests__/helpers/logRow.js';
import { TEST_RUNBOOK_METADATA } from '../../../../../../__tests__/helpers/TEST_RUNBOOK_METADATA.js';

const RUNBOOK = createLambdaAlarmRunbook({
  id: 'pn-fooLambda-LogInvocationErrors-Alarm',
  metadata: TEST_RUNBOOK_METADATA,
  lambda: {
    name: 'pn-fooLambda',
    logGroup: '/aws/lambda/pn-fooLambda',
    varPrefix: 'foo',
    eventSource: 'sqs',
    configuredTimeoutMs: 15000,
  },
  knownErrors: [],
  queryProfile: DEFAULT_LAMBDA_PROFILE,
  product: 'SEND',
});

const API_GW_CONTEXT = {
  kind: 'apigw',
  product: 'SEND',
  apiGwLogGroup: 'access-log-group',
  queryProfileId: 'send',
  services: [],
} as const;

describe('buildLambdaOutputContext', () => {
  it('returns undefined for a runbook without a lambda context', () => {
    for (const runbook of [createTestRunbook(), createTestRunbook({ runbookContext: API_GW_CONTEXT })]) {
      assert.strictEqual(buildLambdaOutputContext(runbook, createTestExecutionResult()), undefined);
    }
  });

  it('builds details.lambda, fields and evidence for a lambda runbook', () => {
    const ctx = buildLambdaOutputContext(
      RUNBOOK,
      createTestExecutionResult({
        vars: {
          lambdaFunctionName: 'pn-fooLambda',
          lambdaLogGroup: '/aws/lambda/pn-fooLambda',
          lambdaEventSource: 'sqs',
          lambdaErrorCount: '1',
          lambdaErrorCategory: 'timeout',
          lambdaRuntimeStatus: 'timeout',
          lambdaRequestId: 'd848f0c5-1089-5c2b-9a3b-91a94511ee52',
          lambdaDurationMs: '10000',
          lastErrorMsg: 'Status: timeout',
        },
        params: { alarmName: 'pn-fooLambda-LogInvocationErrors-Alarm', alarmDatetime: '2026-01-01T00:00:00Z' },
        stepResults: { 'query-lambda-errors': [messageRow('REPORT ... Status: timeout')] },
      }),
    );
    assert.ok(ctx !== undefined);

    const details = ctx.details as {
      readonly lambda: {
        readonly functionName: string;
        readonly errorCategory?: string;
        readonly configuredTimeoutMs?: number;
      };
    };
    assert.strictEqual(details.lambda.functionName, 'pn-fooLambda');
    assert.strictEqual(details.lambda.errorCategory, 'timeout');
    assert.strictEqual(details.lambda.configuredTimeoutMs, 15000);
    assert.ok(ctx.fields.some((field) => field.name === 'lambda' && field.value === 'pn-fooLambda'));
    assert.ok(ctx.evidence.some((evidence) => evidence.id === 'lambda-recent-errors'));
  });

  it('omits from details.lambda what the execution did not produce, keeping the configured timeout', () => {
    const ctx = buildLambdaOutputContext(
      RUNBOOK,
      createTestExecutionResult({ vars: { lambdaFunctionName: 'pn-fooLambda' } }),
    );

    assert.deepStrictEqual(ctx?.details?.['lambda'], {
      functionName: 'pn-fooLambda',
      logGroup: '/aws/lambda/pn-fooLambda',
      configuredTimeoutMs: 15000,
      recentLogs: [],
    });
  });
});
