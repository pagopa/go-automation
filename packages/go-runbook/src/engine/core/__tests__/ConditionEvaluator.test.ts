import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Condition } from '../../types/Condition.js';
import { ConditionEvaluator } from '../ConditionEvaluator.js';
import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import type { TestContextOptions } from '../../../__tests__/helpers/TestContextOptions.js';

const evaluator = new ConditionEvaluator();

const ARR = { stepResults: { arr: ['a', 'b', 'c'] } };
const ROWS = {
  stepResults: {
    q: [
      { message: 'first ok' },
      { message: '[DOWNSTREAM] error 500 (one)' },
      { message: 'unrelated' },
      { message: '[DOWNSTREAM] error 500 (two)' },
    ],
  },
};

function traceOf(condition: Condition, init: TestContextOptions): Readonly<Record<string, unknown>> {
  return evaluator.evaluate(condition, createTestContext(init), { withResolvedValues: true }).resolvedValues;
}

describe('ConditionEvaluator', () => {
  const cases: ReadonlyArray<readonly [string, Condition, TestContextOptions, boolean]> = [
    [
      'compare scalar ==',
      { type: 'compare', ref: 'vars.s', operator: '==', value: '504' },
      { vars: { s: '504' } },
      true,
    ],
    ['compare scalar >', { type: 'compare', ref: 'vars.n', operator: '>', value: 5 }, { vars: { n: '10' } }, true],
    ['compare array, an element matches', { type: 'compare', ref: 'steps.arr', operator: '==', value: 'b' }, ARR, true],
    [
      'compare array, no element matches',
      { type: 'compare', ref: 'steps.arr', operator: '==', value: 'z' },
      ARR,
      false,
    ],
    ['pattern scalar', { type: 'pattern', ref: 'vars.m', regex: 'timed out' }, { vars: { m: 'Read timed out' } }, true],
    ['pattern array, a row matches', { type: 'pattern', ref: 'steps.q', regex: 'DOWNSTREAM' }, ROWS, true],
    ['pattern array, no row matches', { type: 'pattern', ref: 'steps.q', regex: 'nope' }, ROWS, false],
    ['exists non-empty scalar', { type: 'exists', ref: 'vars.x' }, { vars: { x: 'abc' } }, true],
    ['exists missing scalar', { type: 'exists', ref: 'vars.missing' }, {}, false],
    ['exists non-empty array', { type: 'exists', ref: 'steps.arr' }, ARR, true],
    ['exists empty array', { type: 'exists', ref: 'steps.arr' }, { stepResults: { arr: [] } }, false],
    [
      'contains value, scalar in list',
      { type: 'contains', ref: 'vars.s', value: ['500', '502'] },
      { vars: { s: '502' } },
      true,
    ],
    [
      'contains value, scalar not in list',
      { type: 'contains', ref: 'vars.s', value: ['500'] },
      { vars: { s: '200' } },
      false,
    ],
    ['contains value, array intersects list', { type: 'contains', ref: 'steps.arr', value: ['x', 'b'] }, ARR, true],
    ['contains regex, a row matches', { type: 'contains', ref: 'steps.q', regex: 'DOWNSTREAM' }, ROWS, true],
    ['contains regex, no row matches', { type: 'contains', ref: 'steps.q', regex: 'nope' }, ROWS, false],
    [
      'contains regex on a scalar',
      { type: 'contains', ref: 'vars.m', regex: 'DOWN' },
      { vars: { m: '[DOWNSTREAM]' } },
      true,
    ],
    [
      'and over array-aware predicates',
      {
        type: 'and',
        conditions: [
          { type: 'compare', ref: 'vars.s', operator: '==', value: '500' },
          { type: 'pattern', ref: 'steps.q', regex: 'DOWNSTREAM' },
        ],
      },
      { vars: { s: '500' }, stepResults: ROWS.stepResults },
      true,
    ],
  ];

  it('evaluates every predicate kind on scalars and, OR-wise, on arrays', () => {
    for (const [name, condition, init, expected] of cases) {
      assert.strictEqual(evaluator.evaluate(condition, createTestContext(init)), expected, name);
    }
  });
});

describe('ConditionEvaluator trace of array refs', () => {
  const cases: ReadonlyArray<readonly [string, Condition & { readonly ref: string }, TestContextOptions, unknown]> = [
    [
      'compare records the first matching element',
      { type: 'compare', ref: 'steps.arr', operator: '==', value: 'b' },
      ARR,
      { matched: true, matchedIndex: 1, matchedElement: 'b', totalElements: 3 },
    ],
    [
      'pattern records only the first matching row',
      { type: 'pattern', ref: 'steps.q', regex: 'DOWNSTREAM' },
      ROWS,
      { matched: true, matchedIndex: 1, matchedElement: { message: '[DOWNSTREAM] error 500 (one)' }, totalElements: 4 },
    ],
    [
      'contains value records the first matching element',
      { type: 'contains', ref: 'steps.arr', value: ['x', 'b'] },
      ARR,
      { matched: true, matchedIndex: 1, matchedElement: 'b', totalElements: 3 },
    ],
    [
      'exists records a compact summary, not the raw array',
      { type: 'exists', ref: 'steps.q' },
      ROWS,
      { matched: true, totalElements: 4 },
    ],
    [
      'exists on an empty array records no match',
      { type: 'exists', ref: 'steps.q' },
      { stepResults: { q: [] } },
      { matched: false, totalElements: 0 },
    ],
    [
      'contains regex records every matching row',
      { type: 'contains', ref: 'steps.q', regex: 'DOWNSTREAM' },
      ROWS,
      {
        matched: true,
        matchedCount: 2,
        matchedElements: [
          { index: 1, element: { message: '[DOWNSTREAM] error 500 (one)' } },
          { index: 3, element: { message: '[DOWNSTREAM] error 500 (two)' } },
        ],
        totalElements: 4,
        truncated: false,
      },
    ],
  ];

  for (const [name, condition, init, expected] of cases) {
    it(name, () => {
      assert.deepStrictEqual(traceOf(condition, init)[condition.ref], expected);
    });
  }

  it('keeps the raw value of a scalar ref', () => {
    assert.deepStrictEqual(traceOf({ type: 'exists', ref: 'vars.foo' }, { vars: { foo: 'abc' } }), {
      'vars.foo': 'abc',
    });
  });

  it('returns the boolean and the trace from one evaluation', () => {
    const result = evaluator.evaluate(
      { type: 'contains', ref: 'steps.q', regex: 'DOWNSTREAM' },
      createTestContext(ROWS),
      {
        withResolvedValues: true,
      },
    );
    assert.strictEqual(result.matched, true);
    assert.strictEqual((result.resolvedValues['steps.q'] as { matchedCount: number }).matchedCount, 2);
  });

  it('caps contains samples at 10 and flags the truncation', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ message: `[DOWNSTREAM] row ${String(i)}` }));
    const detail = traceOf({ type: 'contains', ref: 'steps.q', regex: 'DOWNSTREAM' }, { stepResults: { q: many } })[
      'steps.q'
    ] as { matchedCount: number; matchedElements: ReadonlyArray<{ index: number }>; truncated: boolean };
    assert.strictEqual(detail.matchedCount, 50);
    assert.deepStrictEqual(
      detail.matchedElements.map((m) => m.index),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
    assert.strictEqual(detail.truncated, true);
  });
});

describe('ConditionEvaluator boolean vs trace mode', () => {
  it('stops an `and` at the first false branch when no trace is requested', () => {
    let secondBranchRan = false;
    const watched = new Proxy([] as string[], {
      get(target, prop, receiver): unknown {
        if (prop === 'length') secondBranchRan = true;
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.status', operator: '==', value: '999' },
        { type: 'contains', ref: 'steps.q.output', regex: 'BOOM' },
      ],
    };

    assert.strictEqual(
      evaluator.evaluate(condition, createTestContext({ vars: { status: '500' }, stepResults: { q: watched } })),
      false,
    );
    assert.strictEqual(secondBranchRan, false, 'the second branch must not be evaluated');
  });

  for (const type of ['and', 'or'] as const) {
    it(`still visits every branch of an \`${type}\` when the trace is requested`, () => {
      const condition: Condition = {
        type,
        conditions: [
          { type: 'compare', ref: 'vars.a', operator: '==', value: type === 'and' ? '999' : '1' },
          { type: 'compare', ref: 'vars.b', operator: '==', value: '2' },
        ],
      };
      const context = createTestContext({ vars: { a: '1', b: '2' } });

      assert.strictEqual(evaluator.evaluate(condition, context), type === 'or');
      assert.deepStrictEqual(evaluator.evaluate(condition, context, { withResolvedValues: true }).resolvedValues, {
        'vars.a': '1',
        'vars.b': '2',
      });
    });
  }

  it('counts every `contains` hit in trace mode, which is why only the boolean mode leaves early', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => (i === 0 ? 'BOOM' : `riga ${String(i)}`));
    const condition: Condition = { type: 'contains', ref: 'steps.q.output', regex: 'BOOM' };
    const context = createTestContext({ stepResults: { q: rows } });

    assert.strictEqual(evaluator.evaluate(condition, context), true);
    assert.deepStrictEqual(
      evaluator.evaluate(condition, context, { withResolvedValues: true }).resolvedValues['steps.q.output'],
      {
        matched: true,
        matchedCount: 1,
        matchedElements: [{ index: 0, element: 'BOOM' }],
        totalElements: 1000,
        truncated: false,
      },
    );
  });
});

describe('ConditionEvaluator resolved values for repeated refs', () => {
  it('keeps every occurrence when a ref is referenced more than once', () => {
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'pattern', ref: 'vars.msg', regex: 'Read' },
        { type: 'pattern', ref: 'vars.msg', regex: 'timed out' },
        { type: 'pattern', ref: 'vars.msg', regex: 'nope' },
      ],
    };

    assert.deepStrictEqual(traceOf(condition, { vars: { msg: 'Read timed out' } }), {
      'vars.msg': 'Read timed out',
      'vars.msg#2': 'Read timed out',
      'vars.msg#3': 'Read timed out',
    });
  });

  it('keeps the distinct match details of several predicates on the same array', () => {
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'contains', ref: 'steps.q.output', regex: 'alpha' },
        { type: 'contains', ref: 'steps.q.output', regex: 'beta' },
      ],
    };

    const resolved = traceOf(condition, { stepResults: { q: ['ERROR alpha', 'WARN beta', 'INFO gamma'] } });

    const detail = (index: number, element: string): unknown => ({
      matched: true,
      matchedCount: 1,
      matchedElements: [{ index, element }],
      totalElements: 3,
      truncated: false,
    });
    assert.deepStrictEqual(resolved['steps.q.output'], detail(0, 'ERROR alpha'));
    assert.deepStrictEqual(resolved['steps.q.output#2'], detail(1, 'WARN beta'));
  });

  it('does not confuse a ref with an inherited object property', () => {
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'exists', ref: 'vars.constructor' },
        { type: 'exists', ref: 'vars.toString' },
      ],
    };

    assert.deepStrictEqual(traceOf(condition, { vars: { constructor: 'a', toString: 'b' } }), {
      'vars.constructor': 'a',
      'vars.toString': 'b',
    });
  });
});
