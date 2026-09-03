import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';
import { ExistsStep } from '../ExistsStep.js';

function createContext(args: {
  readonly vars?: Record<string, string>;
  readonly params?: Record<string, string>;
  readonly stepResults?: ReadonlyArray<readonly [string, unknown]>;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(args.stepResults ?? []),
    vars: new Map(Object.entries(args.vars ?? {})),
    params: new Map(Object.entries(args.params ?? {})),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('ExistsStep', () => {
  it('succeeds when the reference resolves to a value', async () => {
    const step = new ExistsStep({ id: 'check-trace', label: 'Trace id present', ref: 'vars.traceId' });

    const result = await step.execute(createContext({ vars: { traceId: '1-abc' } }));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, true);
  });

  it('fails when the reference is missing', async () => {
    const step = new ExistsStep({ id: 'check-trace', label: 'Trace id present', ref: 'vars.traceId' });

    const result = await step.execute(createContext({}));

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.output, false);
    assert.match(result.error ?? '', /is undefined/u);
  });

  it('treats an empty string as missing', async () => {
    const step = new ExistsStep({ id: 'check-trace', label: 'Trace id present', ref: 'vars.traceId' });

    const result = await step.execute(createContext({ vars: { traceId: '' } }));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /is empty/u);
  });

  it('resolves params as well as vars', async () => {
    const step = new ExistsStep({ id: 'check-alarm', label: 'Alarm name present', ref: 'params.alarmName' });

    const result = await step.execute(createContext({ params: { alarmName: 'pn-delivery-B2B-ApiGwAlarm' } }));

    assert.strictEqual(result.success, true);
  });
});
