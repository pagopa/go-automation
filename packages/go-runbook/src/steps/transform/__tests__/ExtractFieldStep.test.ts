import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../services/createTestServiceRegistry.js';
import { ExtractFieldStep } from '../ExtractFieldStep.js';

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

describe('ExtractFieldStep', () => {
  const base = {
    id: 'extract-status',
    label: 'Extract status',
    fromStep: 'query',
    fieldPath: '[0].status',
    saveAs: 'status',
  } as const;

  it('navigates the field path and saves the value as a string', async () => {
    const result = await new ExtractFieldStep(base).execute(
      createContext({ stepResults: [['query', [{ status: 502 }]]] }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, '502');
    assert.deepStrictEqual(result.vars, { status: '502' });
  });

  it('fails when the upstream step produced no output', async () => {
    const result = await new ExtractFieldStep(base).execute(createContext({}));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Step output not found: "query"/u);
  });

  it('fails when the field path resolves to nothing', async () => {
    const result = await new ExtractFieldStep({ ...base, fieldPath: '[0].missing' }).execute(
      createContext({ stepResults: [['query', [{ status: 502 }]]] }),
    );

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /resolved to undefined/u);
  });
});
