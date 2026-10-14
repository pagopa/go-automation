import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ResultField } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../framework.js';
import { ConditionEvaluator } from '../../framework.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { AnalyzeS3RecoveryStep } from '../AnalyzeS3RecoveryStep.js';
import { KNOWN_CASES } from '../knownCases.js';

const REQUEST = 'df18c750-e3f3-4ca6-b9d1-7480b0afbd2f';
const SLOW_DOWN = `Invoke Error ${JSON.stringify({
  errorType: 'SlowDown',
  errorMessage: 'Please reduce your request rate.',
  $metadata: { httpStatusCode: 503 },
  stack: ['at S3RestXmlProtocol.handleError (...)'],
})}`;
type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;

function row(message: string, second: number, source = 'core'): ReadonlyArray<ResultField> {
  return [
    { field: '@timestamp', value: `2026-10-12 15:31:${String(second).padStart(2, '0')}.000` },
    { field: '@requestId', value: REQUEST },
    { field: '@message', value: message },
    { field: 'sourceAccount', value: source },
  ];
}

function flow(source = 'core'): Rows {
  return [
    row(`START RequestId: ${REQUEST}`, 0, source),
    row('Processing log group: /aws/ecs/example, stream: stream, events: 8', 1, source),
    row(SLOW_DOWN, 2, source),
    row(`REPORT RequestId: ${REQUEST}\tDuration: 1700 ms\tMemory Size: 128 MB\tMax Memory Used: 114 MB`, 3, source),
    row(`START RequestId: ${REQUEST}`, 50, source),
    row('Processing log group: /aws/ecs/example, stream: stream, events: 8', 51, source),
    row('Written 8 record(s) to s3://example-bucket/retried-object.json', 52, source),
    row(`REPORT RequestId: ${REQUEST}\tDuration: 35 ms\tMemory Size: 128 MB\tMax Memory Used: 115 MB`, 53, source),
  ];
}

function context(errors: Rows, invocations: Rows, checked = true): RunbookContext {
  return {
    executionId: 'recovery-test',
    startedAt: new Date(),
    stepResults: new Map([
      ['query-lambda-errors', errors],
      ['query-lambda-invocation', invocations],
    ]),
    vars: new Map(checked ? [['downstreamMonitoringAccountsChecked', 'core,confinfo']] : []),
    params: new Map(),
    logs: [],
    recoveredErrors: [],
    services: createTestServiceRegistry(),
  };
}

describe('AnalyzeS3RecoveryStep', () => {
  it('recognizes recovery only after the complete batch is written and a later REPORT completes', async () => {
    const input = context([row(SLOW_DOWN, 2)], flow());
    const result = await new AnalyzeS3RecoveryStep().execute(input);
    assert.strictEqual(result.vars?.['downstreamMonitoringS3Recovery'], 'RECOVERED_ALL');
    assert.strictEqual(result.vars?.['downstreamMonitoringS3RecoveredRequestCount'], '1');
    const vars = new Map([...input.vars, ...Object.entries(result.vars ?? {})]);
    assert.deepStrictEqual(
      KNOWN_CASES.filter((knownCase) => new ConditionEvaluator().evaluate(knownCase.condition, { ...input, vars })).map(
        ({ id }) => id,
      ),
      ['downstream-monitoring-s3-slow-down-recovered'],
    );
  });

  it('does not confuse identical request IDs in different accounts', async () => {
    const result = await new AnalyzeS3RecoveryStep().execute(
      context([row(SLOW_DOWN, 2), row(SLOW_DOWN, 2, 'confinfo')], flow()),
    );
    assert.strictEqual(result.vars?.['downstreamMonitoringS3Recovery'], 'UNCONFIRMED');
    assert.strictEqual(result.vars?.['downstreamMonitoringS3RequestCount'], '2');
    assert.strictEqual(result.vars?.['downstreamMonitoringS3RecoveredRequestCount'], '1');
  });

  it('requires matching record counts, a complete flow and a successful final REPORT', async () => {
    for (const invocations of [
      flow().slice(0, -1),
      flow().filter((entry) => !entry.some((field) => field.value?.startsWith('Processing'))),
      flow().map((entry) =>
        entry.map((field) => ({ ...field, value: field.value?.replace('Written 8', 'Written 7') })),
      ),
      [...flow(), row(SLOW_DOWN, 54)],
      [...flow(), row(`REPORT RequestId: ${REQUEST}\tDuration: 60 ms\tStatus: error`, 54)],
    ]) {
      const result = await new AnalyzeS3RecoveryStep().execute(context([row(SLOW_DOWN, 2)], invocations));
      assert.strictEqual(result.vars?.['downstreamMonitoringS3Recovery'], 'UNCONFIRMED');
    }
  });

  it('keeps mixed errors or incomplete account checks open', async () => {
    for (const input of [
      context([row(SLOW_DOWN, 2), row('ERROR AccessDenied', 4)], flow()),
      context([row(SLOW_DOWN, 2)], flow(), false),
      context([row(SLOW_DOWN.replace('503', '5030'), 2)], flow()),
      context([], flow()),
    ]) {
      const result = await new AnalyzeS3RecoveryStep().execute(input);
      assert.strictEqual(result.vars?.['downstreamMonitoringS3Recovery'], 'UNCONFIRMED');
    }
  });
});
