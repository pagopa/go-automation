import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../services/createTestServiceRegistry.js';
import { AssertStep } from '../AssertStep.js';

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

describe('AssertStep', () => {
  it('passes when the condition holds', async () => {
    const step = new AssertStep({
      id: 'assert-status',
      label: 'Status must be 500',
      condition: { type: 'compare', ref: 'vars.status', operator: '==', value: '500' },
    });

    const result = await step.execute(createContext({ vars: { status: '500' } }));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, true);
  });

  it('fails with a message naming the step when the condition does not hold', async () => {
    const step = new AssertStep({
      id: 'assert-status',
      label: 'Status must be 500',
      condition: { type: 'compare', ref: 'vars.status', operator: '==', value: '500' },
    });

    const result = await step.execute(createContext({ vars: { status: '404' } }));

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.output, false);
    assert.match(result.error ?? '', /Assertion failed for step "assert-status"/u);
  });

  it('evaluates composite conditions', async () => {
    const step = new AssertStep({
      id: 'assert-both',
      label: 'Both must hold',
      condition: {
        type: 'and',
        conditions: [
          { type: 'exists', ref: 'vars.traceId' },
          { type: 'pattern', ref: 'vars.status', regex: '^5\\d\\d$' },
        ],
      },
    });

    assert.strictEqual((await step.execute(createContext({ vars: { traceId: '1-a', status: '503' } }))).success, true);
    assert.strictEqual((await step.execute(createContext({ vars: { status: '503' } }))).success, false);
  });
});
