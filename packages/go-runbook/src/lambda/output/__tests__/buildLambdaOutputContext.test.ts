import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResultField } from '@go-automation/go-common/aws';

import type { Runbook } from '../../../types/Runbook.js';
import type { RunbookExecutionResult } from '../../../types/RunbookExecutionResult.js';
import { createLambdaAlarmRunbook } from '../../builders/createLambdaAlarmRunbook.js';
import { buildLambdaOutputContext } from '../buildLambdaOutputContext.js';

function row(message: string): ReadonlyArray<ResultField> {
  return [
    { field: '@timestamp', value: '2026-01-01T00:00:00.000Z' },
    { field: '@message', value: message },
  ];
}

function fakeResult(
  vars: Map<string, string>,
  params: Map<string, string>,
  stepResults: Map<string, unknown>,
): RunbookExecutionResult {
  return { finalContext: { vars, params, stepResults } } as unknown as RunbookExecutionResult;
}

describe('buildLambdaOutputContext', () => {
  it('returns undefined for a non-lambda runbook', () => {
    const runbook = { runbookContext: { kind: 'apigw' } } as unknown as Runbook;
    assert.strictEqual(buildLambdaOutputContext(runbook, fakeResult(new Map(), new Map(), new Map())), undefined);
  });

  it('builds details.lambda, fields and evidence for a lambda runbook', () => {
    const runbook = createLambdaAlarmRunbook({
      id: 'pn-fooLambda-LogInvocationErrors-Alarm',
      metadata: { name: 'x', description: '', version: '1.0.0', type: 'alarm-resolution', team: 'GO', tags: [] },
      lambda: { name: 'pn-fooLambda', logGroup: '/aws/lambda/pn-fooLambda', varPrefix: 'foo', eventSource: 'sqs' },
      knownCases: [],
    });

    const vars = new Map<string, string>([
      ['lambdaFunctionName', 'pn-fooLambda'],
      ['lambdaLogGroup', '/aws/lambda/pn-fooLambda'],
      ['lambdaEventSource', 'sqs'],
      ['lambdaErrorCount', '1'],
      ['lambdaErrorCategory', 'timeout'],
      ['lambdaRuntimeStatus', 'timeout'],
      ['lambdaRequestId', 'd848f0c5-1089-5c2b-9a3b-91a94511ee52'],
      ['lambdaDurationMs', '10000'],
      ['lastErrorMsg', 'Status: timeout'],
    ]);
    const params = new Map<string, string>([
      ['alarmName', 'pn-fooLambda-LogInvocationErrors-Alarm'],
      ['alarmDatetime', '2026-01-01T00:00:00Z'],
    ]);
    const stepResults = new Map<string, unknown>([['query-lambda-errors', [row('REPORT ... Status: timeout')]]]);

    const ctx = buildLambdaOutputContext(runbook, fakeResult(vars, params, stepResults));
    assert.ok(ctx !== undefined);

    const details = ctx.details as {
      readonly lambda: { readonly functionName: string; readonly errorCategory?: string };
    };
    assert.strictEqual(details.lambda.functionName, 'pn-fooLambda');
    assert.strictEqual(details.lambda.errorCategory, 'timeout');
    assert.ok(ctx.fields.some((field) => field.name === 'lambda' && field.value === 'pn-fooLambda'));
    assert.ok(ctx.evidence.some((evidence) => evidence.id === 'lambda-recent-errors'));
  });

  it('surfaces configuredTimeoutMs in details.lambda when configured', () => {
    const runbook = createLambdaAlarmRunbook({
      id: 'pn-fooLambda-LogInvocationErrors-Alarm',
      metadata: { name: 'x', description: '', version: '1.0.0', type: 'alarm-resolution', team: 'GO', tags: [] },
      lambda: {
        name: 'pn-fooLambda',
        logGroup: '/aws/lambda/pn-fooLambda',
        varPrefix: 'foo',
        configuredTimeoutMs: 15000,
      },
      knownCases: [],
    });

    const ctx = buildLambdaOutputContext(
      runbook,
      fakeResult(new Map([['lambdaFunctionName', 'pn-fooLambda']]), new Map(), new Map()),
    );
    assert.ok(ctx !== undefined);
    const details = ctx.details as { readonly lambda: { readonly configuredTimeoutMs?: number } };
    assert.strictEqual(details.lambda.configuredTimeoutMs, 15000);
  });
});
