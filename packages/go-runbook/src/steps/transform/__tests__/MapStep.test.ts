import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';
import { MapStep } from '../MapStep.js';

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

describe('MapStep', () => {
  it('applies the mapping function to every element', async () => {
    const step = new MapStep({
      id: 'map-ids',
      label: 'Map ids',
      fromStep: 'query',
      mappingFn: (element) => (element as { readonly id: string }).id,
    });

    const result = await step.execute(createContext({ stepResults: [['query', [{ id: 'a' }, { id: 'b' }]]] }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, ['a', 'b']);
  });

  it('passes the element index to the mapping function', async () => {
    const step = new MapStep({
      id: 'map-indexed',
      label: 'Map indexed',
      fromStep: 'query',
      mappingFn: (element, index) => `${String(index)}:${String(element)}`,
    });

    assert.deepStrictEqual((await step.execute(createContext({ stepResults: [['query', ['x', 'y']]] }))).output, [
      '0:x',
      '1:y',
    ]);
  });

  it('fails when the upstream output is not an array', async () => {
    const step = new MapStep({ id: 'map-ids', label: 'Map ids', fromStep: 'query', mappingFn: (element) => element });

    const result = await step.execute(createContext({ stepResults: [['query', { not: 'an array' }]] }));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /is not an array/u);
  });

  it('fails when the upstream step produced no output', async () => {
    const step = new MapStep({ id: 'map-ids', label: 'Map ids', fromStep: 'query', mappingFn: (element) => element });

    assert.strictEqual((await step.execute(createContext({}))).success, false);
  });
});
