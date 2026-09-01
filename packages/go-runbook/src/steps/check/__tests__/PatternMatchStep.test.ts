import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../services/createTestServiceRegistry.js';
import { PatternMatchStep } from '../PatternMatchStep.js';

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

describe('PatternMatchStep', () => {
  it('succeeds when the resolved value matches the pattern', async () => {
    const step = new PatternMatchStep({
      id: 'match-5xx',
      label: 'Status is 5xx',
      ref: 'vars.status',
      regex: '^5\\d\\d$',
    });

    const result = await step.execute(createContext({ vars: { status: '502' } }));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, true);
  });

  it('fails with the value and the pattern in the message when it does not match', async () => {
    const step = new PatternMatchStep({
      id: 'match-5xx',
      label: 'Status is 5xx',
      ref: 'vars.status',
      regex: '^5\\d\\d$',
    });

    const result = await step.execute(createContext({ vars: { status: '404' } }));

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.output, false);
    assert.match(result.error ?? '', /"404" does not match/u);
  });

  it('fails when the reference does not resolve', async () => {
    const step = new PatternMatchStep({ id: 'match-5xx', label: 'Status is 5xx', ref: 'vars.status', regex: '.' });

    const result = await step.execute(createContext({}));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /resolved to undefined/u);
  });
});
