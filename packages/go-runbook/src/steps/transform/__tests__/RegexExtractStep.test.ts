import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';
import { RegexExtractStep } from '../RegexExtractStep.js';

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

describe('RegexExtractStep', () => {
  const base = {
    id: 'extract-trace',
    label: 'Extract trace id',
    fromStep: 'query',
    fieldPath: '[0].message',
    pattern: 'traceId=([0-9a-f-]+)',
    group: 1,
    saveAs: 'traceId',
  } as const;

  it('extracts the requested capture group', async () => {
    const result = await new RegexExtractStep(base).execute(
      createContext({ stepResults: [['query', [{ message: 'boom traceId=1-abc-def rest' }]]] }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, '1-abc-def');
    assert.deepStrictEqual(result.vars, { traceId: '1-abc-def' });
  });

  it('succeeds with an undefined output and an empty var when nothing matches', async () => {
    const result = await new RegexExtractStep(base).execute(
      createContext({ stepResults: [['query', [{ message: 'no trace here' }]]] }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, undefined);
    assert.deepStrictEqual(result.vars, { traceId: '' });
  });

  it('extracts the whole match with group 0', async () => {
    const result = await new RegexExtractStep({ ...base, group: 0 }).execute(
      createContext({ stepResults: [['query', [{ message: 'boom traceId=1-abc rest' }]]] }),
    );

    assert.strictEqual(result.output, 'traceId=1-abc');
  });

  it('fails when the field path resolves to nothing', async () => {
    const result = await new RegexExtractStep({ ...base, fieldPath: '[0].missing' }).execute(
      createContext({ stepResults: [['query', [{ message: 'x' }]]] }),
    );

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /resolved to undefined/u);
  });
});
