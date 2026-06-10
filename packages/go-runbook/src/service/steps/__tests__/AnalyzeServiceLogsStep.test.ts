import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import type { ServiceLogSchema } from '../../types/ServiceLogSchema.js';
import { AnalyzeServiceLogsStep } from '../analyzeServiceLogs.js';

const SCHEMA: ServiceLogSchema = {
  messageFieldCandidates: ['message', '@message'],
  levelField: 'level',
  traceIdField: 'trace_id',
};

function ctx(stepResults: ReadonlyArray<readonly [string, unknown]> = []): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-06-09T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map<string, string>(),
    params: new Map<string, string>(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function step(): AnalyzeServiceLogsStep {
  return new AnalyzeServiceLogsStep({
    id: 'analyze-pn-foo',
    label: 'Analisi log pn-foo',
    fromStep: 'query-pn-foo',
    varPrefix: 'foo',
    schema: SCHEMA,
  });
}

describe('AnalyzeServiceLogsStep', () => {
  it('extracts the error message and canonical trace id into prefixed vars', async () => {
    const rows = [
      [
        { field: 'level', value: 'ERROR' },
        { field: '@message', value: 'Exception: boom' },
        { field: 'trace_id', value: '6a1d12cde853a9726be9c7c20da54682' },
      ],
    ];

    const result = await step().execute(ctx([['query-pn-foo', rows]]));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.logCount, 1);
    assert.strictEqual(result.output?.errorMessage, 'Exception: boom');
    assert.strictEqual(result.output?.traceId, '1-6a1d12cd-e853a9726be9c7c20da54682');
    assert.strictEqual(result.output?.traceIdRaw, '6a1d12cde853a9726be9c7c20da54682');
    assert.strictEqual(result.vars?.['fooTraceId'], '1-6a1d12cd-e853a9726be9c7c20da54682');
    assert.strictEqual(result.vars?.['fooLogCount'], '1');
    assert.strictEqual(result.vars?.['fooErrorMsg'], 'Exception: boom');
    assert.strictEqual(result.next, 'resolve');

    // Only prefixed vars are emitted: no un-prefixed globals that could collide.
    assert.deepStrictEqual(Object.keys(result.vars ?? {}).sort(), [
      'fooErrorMsg',
      'fooFallbackUuid',
      'fooLogCount',
      'fooTraceId',
      'fooTraceIdRaw',
    ]);
  });

  it('fails with the canonical "not found" message when the upstream step is missing', async () => {
    const result = await step().execute(ctx());

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Step output not found/);
  });
});
