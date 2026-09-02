import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../types/RunbookContext.js';
import type { Condition } from '../../types/Condition.js';
import { ConditionEvaluator } from '../ConditionEvaluator.js';
import { createTestServiceRegistry } from '../../registry/createTestServiceRegistry.js';

interface Row {
  readonly [key: string]: string;
}

function ctx(args: {
  readonly vars?: Record<string, string>;
  readonly stepResults?: ReadonlyArray<readonly [string, unknown]>;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-05-13T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(args.stepResults ?? []),
    vars: new Map(Object.entries(args.vars ?? {})),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('ConditionEvaluator (array-aware)', () => {
  const evaluator = new ConditionEvaluator();

  function resolvedValues(condition: Condition, context: RunbookContext): Readonly<Record<string, unknown>> {
    return evaluator.evaluate(condition, context, { withResolvedValues: true }).resolvedValues;
  }

  describe('compare', () => {
    it('keeps scalar behaviour unchanged (==)', () => {
      const c = ctx({ vars: { statusCode: '504' } });
      assert.strictEqual(
        evaluator.evaluate({ type: 'compare', ref: 'vars.statusCode', operator: '==', value: '504' }, c),
        true,
      );
    });

    it('keeps scalar behaviour unchanged (>)', () => {
      const c = ctx({ vars: { count: '10' } });
      assert.strictEqual(evaluator.evaluate({ type: 'compare', ref: 'vars.count', operator: '>', value: 5 }, c), true);
    });

    it('OR-matches array refs (any element satisfies the predicate)', () => {
      const c = ctx({ stepResults: [['arr', ['a', 'b', 'c']]] });
      assert.strictEqual(
        evaluator.evaluate({ type: 'compare', ref: 'steps.arr', operator: '==', value: 'b' }, c),
        true,
      );
      assert.strictEqual(
        evaluator.evaluate({ type: 'compare', ref: 'steps.arr', operator: '==', value: 'z' }, c),
        false,
      );
    });

    it('records the matched element in detailed evaluation for array refs', () => {
      const c = ctx({ stepResults: [['arr', ['a', 'b', 'c']]] });
      const resolved = resolvedValues({ type: 'compare', ref: 'steps.arr', operator: '==', value: 'b' }, c);
      assert.deepStrictEqual(resolved['steps.arr'], {
        matched: true,
        matchedIndex: 1,
        matchedElement: 'b',
        totalElements: 3,
      });
    });
  });

  describe('pattern', () => {
    it('keeps scalar behaviour unchanged', () => {
      const c = ctx({ vars: { msg: 'Endpoint request timed out' } });
      assert.strictEqual(evaluator.evaluate({ type: 'pattern', ref: 'vars.msg', regex: 'timed out' }, c), true);
    });

    it('OR-matches array refs with short-circuit on first match', () => {
      const rows: Row[] = [{ message: 'ok' }, { message: '[DOWNSTREAM] error 500' }, { message: 'other' }];
      const c = ctx({ stepResults: [['query-X', rows]] });
      assert.strictEqual(evaluator.evaluate({ type: 'pattern', ref: 'steps.query-X', regex: 'DOWNSTREAM' }, c), true);
    });

    it('records only the first matching row in the trace (short-circuit semantic)', () => {
      const rows: Row[] = [{ message: 'a' }, { message: '[DOWNSTREAM] one' }, { message: '[DOWNSTREAM] two' }];
      const c = ctx({ stepResults: [['q', rows]] });
      const resolved = resolvedValues({ type: 'pattern', ref: 'steps.q', regex: 'DOWNSTREAM' }, c);
      const detail = resolved['steps.q'] as { matched: boolean; matchedIndex: number; matchedElement: Row };
      assert.strictEqual(detail.matched, true);
      assert.strictEqual(detail.matchedIndex, 1);
      assert.deepStrictEqual(detail.matchedElement, { message: '[DOWNSTREAM] one' });
    });

    it('returns false when no element matches', () => {
      const c = ctx({ stepResults: [['q', [{ message: 'ok' }]]] });
      assert.strictEqual(evaluator.evaluate({ type: 'pattern', ref: 'steps.q', regex: 'DOWNSTREAM' }, c), false);
    });
  });

  describe('exists', () => {
    it('returns true for non-empty scalars', () => {
      const c = ctx({ vars: { x: 'abc' } });
      assert.strictEqual(evaluator.evaluate({ type: 'exists', ref: 'vars.x' }, c), true);
    });

    it('returns false for missing scalars', () => {
      assert.strictEqual(evaluator.evaluate({ type: 'exists', ref: 'vars.missing' }, ctx({})), false);
    });

    it('returns true for non-empty arrays', () => {
      const c = ctx({ stepResults: [['arr', ['a']]] });
      assert.strictEqual(evaluator.evaluate({ type: 'exists', ref: 'steps.arr' }, c), true);
    });

    it('returns false for empty arrays', () => {
      const c = ctx({ stepResults: [['arr', []]] });
      assert.strictEqual(evaluator.evaluate({ type: 'exists', ref: 'steps.arr' }, c), false);
    });

    it('records a compact `{matched,totalElements}` summary for array refs (not the raw array)', () => {
      // Simulate a CloudWatch query output with several rows — dumping
      // the full array in the trace would bloat the execution JSON.
      const c = ctx({
        stepResults: [['q', [{ '@message': 'row 1' }, { '@message': 'row 2' }, { '@message': 'row 3' }]]],
      });
      const resolved = resolvedValues({ type: 'exists', ref: 'steps.q' }, c);
      assert.deepStrictEqual(resolved['steps.q'], { matched: true, totalElements: 3 });
    });

    it('records `{matched:false,totalElements:0}` for empty array refs', () => {
      const c = ctx({ stepResults: [['q', []]] });
      const resolved = resolvedValues({ type: 'exists', ref: 'steps.q' }, c);
      assert.deepStrictEqual(resolved['steps.q'], { matched: false, totalElements: 0 });
    });

    it('keeps scalar resolvedValues unchanged for backwards compat', () => {
      const c = ctx({ vars: { foo: 'abc' } });
      const resolved = resolvedValues({ type: 'exists', ref: 'vars.foo' }, c);
      assert.strictEqual(resolved['vars.foo'], 'abc');
    });
  });

  describe('contains — value variant (SQL IN)', () => {
    it('returns true when a scalar ref is in the value list', () => {
      const c = ctx({ vars: { statusCode: '502' } });
      assert.strictEqual(
        evaluator.evaluate({ type: 'contains', ref: 'vars.statusCode', value: ['500', '502', '504'] }, c),
        true,
      );
    });

    it('returns false when a scalar ref is not in the value list', () => {
      const c = ctx({ vars: { statusCode: '200' } });
      assert.strictEqual(
        evaluator.evaluate({ type: 'contains', ref: 'vars.statusCode', value: ['500', '502', '504'] }, c),
        false,
      );
    });

    it('returns true when an array ref intersects the value list', () => {
      const c = ctx({ stepResults: [['arr', ['a', 'b', 'c']]] });
      assert.strictEqual(evaluator.evaluate({ type: 'contains', ref: 'steps.arr', value: ['x', 'b'] }, c), true);
    });

    it('records first matching element for array+value', () => {
      const c = ctx({ stepResults: [['arr', ['a', 'b', 'c']]] });
      const resolved = resolvedValues({ type: 'contains', ref: 'steps.arr', value: ['x', 'b'] }, c);
      assert.deepStrictEqual(resolved['steps.arr'], {
        matched: true,
        matchedIndex: 1,
        matchedElement: 'b',
        totalElements: 3,
      });
    });
  });

  describe('contains — regex variant (find all matching rows)', () => {
    const rows: Row[] = [
      { message: 'first ok' },
      { message: '[DOWNSTREAM] error 500 (one)' },
      { message: 'unrelated' },
      { message: '[DOWNSTREAM] error 500 (two)' },
      { message: 'last' },
    ];

    it('returns true when at least one row matches', () => {
      const c = ctx({ stepResults: [['q', rows]] });
      assert.strictEqual(evaluator.evaluate({ type: 'contains', ref: 'steps.q', regex: 'DOWNSTREAM' }, c), true);
    });

    it('returns false when no row matches', () => {
      const c = ctx({ stepResults: [['q', [{ message: 'ok' }]]] });
      assert.strictEqual(evaluator.evaluate({ type: 'contains', ref: 'steps.q', regex: 'DOWNSTREAM' }, c), false);
    });

    it('records every matching row in the trace when under the sample cap', () => {
      const c = ctx({ stepResults: [['q', rows]] });
      const resolved = resolvedValues({ type: 'contains', ref: 'steps.q', regex: 'DOWNSTREAM' }, c);
      const detail = resolved['steps.q'] as {
        matched: boolean;
        matchedCount: number;
        matchedElements: ReadonlyArray<{ index: number; element: Row }>;
        totalElements: number;
        truncated: boolean;
      };
      assert.strictEqual(detail.matched, true);
      assert.strictEqual(detail.matchedCount, 2);
      assert.strictEqual(detail.totalElements, 5);
      assert.strictEqual(detail.truncated, false);
      assert.deepStrictEqual(
        detail.matchedElements.map((m) => m.index),
        [1, 3],
      );
    });

    it('returns the boolean result and trace detail from one evaluation pass', () => {
      const c = ctx({ stepResults: [['q', rows]] });
      const result = evaluator.evaluate(
        {
          type: 'contains',
          ref: 'steps.q',
          regex: 'DOWNSTREAM',
        },
        c,
        { withResolvedValues: true },
      );
      const detail = result.resolvedValues['steps.q'] as {
        matched: boolean;
        matchedCount: number;
        matchedElements: ReadonlyArray<{ index: number; element: Row }>;
        totalElements: number;
        truncated: boolean;
      };

      assert.strictEqual(result.matched, true);
      assert.strictEqual(detail.matched, true);
      assert.strictEqual(detail.matchedCount, 2);
      assert.deepStrictEqual(
        detail.matchedElements.map((m) => m.index),
        [1, 3],
      );
    });

    it('caps matchedElements at 10 samples and flags truncated=true on overflow', () => {
      // 50 rows, every one matches → matchedCount=50, samples=10, truncated=true.
      const many: Row[] = Array.from({ length: 50 }, (_, i) => ({ message: `[DOWNSTREAM] row ${i}` }));
      const c = ctx({ stepResults: [['q', many]] });
      const resolved = resolvedValues({ type: 'contains', ref: 'steps.q', regex: 'DOWNSTREAM' }, c);
      const detail = resolved['steps.q'] as {
        matched: boolean;
        matchedCount: number;
        matchedElements: ReadonlyArray<{ index: number; element: Row }>;
        totalElements: number;
        truncated: boolean;
      };
      assert.strictEqual(detail.matched, true);
      assert.strictEqual(detail.matchedCount, 50);
      assert.strictEqual(detail.totalElements, 50);
      assert.strictEqual(detail.matchedElements.length, 10);
      assert.strictEqual(detail.truncated, true);
      assert.deepStrictEqual(
        detail.matchedElements.map((m) => m.index),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      );
    });

    it('works on scalar ref (= regex.test on the scalar)', () => {
      const c = ctx({ vars: { msg: '[DOWNSTREAM] hi' } });
      assert.strictEqual(evaluator.evaluate({ type: 'contains', ref: 'vars.msg', regex: 'DOWNSTREAM' }, c), true);
    });
  });

  describe('logical composition', () => {
    it('and/or/not work transparently with array-aware predicates', () => {
      const c = ctx({
        vars: { statusCode: '500' },
        stepResults: [['q', [{ message: '[DOWNSTREAM] x' }]]],
      });
      const condition = {
        type: 'and' as const,
        conditions: [
          { type: 'compare' as const, ref: 'vars.statusCode', operator: '==' as const, value: '500' },
          { type: 'pattern' as const, ref: 'steps.q', regex: 'DOWNSTREAM' },
        ],
      };
      assert.strictEqual(evaluator.evaluate(condition, c), true);
    });
  });
});

describe('ConditionEvaluator boolean vs trace mode', () => {
  /** Counts how many array elements a predicate actually looked at. */
  function countingRows(size: number, hitAt: number): ReadonlyArray<string> {
    return Array.from({ length: size }, (_, i) => (i === hitAt ? 'BOOM' : `riga ${String(i)}`));
  }

  it('stops an `and` at the first false branch when no trace is requested', () => {
    let secondBranchRan = false;
    const context = ctx({
      vars: { status: '500' },
      stepResults: [
        [
          'q',
          new Proxy([] as string[], {
            get(target, prop, receiver): unknown {
              if (prop === 'length') secondBranchRan = true;
              return Reflect.get(target, prop, receiver) as unknown;
            },
          }),
        ],
      ],
    });
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.status', operator: '==', value: '999' },
        { type: 'contains', ref: 'steps.q.output', regex: 'BOOM' },
      ],
    };

    assert.strictEqual(new ConditionEvaluator().evaluate(condition, context), false);
    assert.strictEqual(secondBranchRan, false, 'the second branch must not be evaluated');
  });

  it('still visits every branch when the trace is requested', () => {
    const context = ctx({ vars: { a: '1', b: '2' } });
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'compare', ref: 'vars.a', operator: '==', value: '999' },
        { type: 'compare', ref: 'vars.b', operator: '==', value: '2' },
      ],
    };

    const detailed = new ConditionEvaluator().evaluate(condition, context, { withResolvedValues: true });

    assert.strictEqual(detailed.matched, false);
    // The branch that did not decide the outcome is still in the trace.
    assert.deepStrictEqual(detailed.resolvedValues, { 'vars.a': '1', 'vars.b': '2' });
  });

  it('stops an `or` at the first true branch when no trace is requested', () => {
    const context = ctx({ vars: { a: '1', b: '2' } });
    const condition: Condition = {
      type: 'or',
      conditions: [
        { type: 'compare', ref: 'vars.a', operator: '==', value: '1' },
        { type: 'compare', ref: 'vars.b', operator: '==', value: '2' },
      ],
    };
    const evaluator = new ConditionEvaluator();

    assert.strictEqual(evaluator.evaluate(condition, context), true);
    assert.deepStrictEqual(evaluator.evaluate(condition, context, { withResolvedValues: true }).resolvedValues, {
      'vars.a': '1',
      'vars.b': '2',
    });
  });

  it('leaves a `contains` regex as soon as one element matches, when no trace is requested', () => {
    const rows = countingRows(1000, 0);
    const context = ctx({ stepResults: [['q', rows]] });
    const condition: Condition = { type: 'contains', ref: 'steps.q.output', regex: 'BOOM' };
    const evaluator = new ConditionEvaluator();

    assert.strictEqual(evaluator.evaluate(condition, context), true);

    // The trace mode still counts every hit, which is why it cannot leave early.
    const detailed = evaluator.evaluate(condition, context, { withResolvedValues: true });
    assert.deepStrictEqual(detailed.resolvedValues['steps.q.output'], {
      matched: true,
      matchedCount: 1,
      matchedElements: [{ index: 0, element: 'BOOM' }],
      totalElements: 1000,
      truncated: false,
    });
  });
});

describe('ConditionEvaluator resolved values for repeated refs', () => {
  it('keeps every occurrence when a ref is referenced more than once', () => {
    const context = ctx({ vars: { msg: 'Read timed out' } });
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'pattern', ref: 'vars.msg', regex: 'Read' },
        { type: 'pattern', ref: 'vars.msg', regex: 'timed out' },
        { type: 'pattern', ref: 'vars.msg', regex: 'nope' },
      ],
    };

    const { resolvedValues } = new ConditionEvaluator().evaluate(condition, context, { withResolvedValues: true });

    assert.deepStrictEqual(resolvedValues, {
      'vars.msg': 'Read timed out',
      'vars.msg#2': 'Read timed out',
      'vars.msg#3': 'Read timed out',
    });
  });

  it('keeps the distinct match details of several predicates on the same array', () => {
    const rows = ['ERROR alpha', 'WARN beta', 'INFO gamma'];
    const context = ctx({ stepResults: [['q', rows]] });
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'contains', ref: 'steps.q.output', regex: 'alpha' },
        { type: 'contains', ref: 'steps.q.output', regex: 'beta' },
      ],
    };

    const { resolvedValues } = new ConditionEvaluator().evaluate(condition, context, { withResolvedValues: true });

    // Before the fix the second predicate overwrote the first and the trace
    // could not show which rows satisfied which pattern.
    assert.deepStrictEqual(resolvedValues['steps.q.output'], {
      matched: true,
      matchedCount: 1,
      matchedElements: [{ index: 0, element: 'ERROR alpha' }],
      totalElements: 3,
      truncated: false,
    });
    assert.deepStrictEqual(resolvedValues['steps.q.output#2'], {
      matched: true,
      matchedCount: 1,
      matchedElements: [{ index: 1, element: 'WARN beta' }],
      totalElements: 3,
      truncated: false,
    });
  });

  it('leaves a ref used once untouched', () => {
    const context = ctx({ vars: { only: 'x' } });
    const condition: Condition = { type: 'exists', ref: 'vars.only' };

    const { resolvedValues } = new ConditionEvaluator().evaluate(condition, context, { withResolvedValues: true });

    assert.deepStrictEqual(resolvedValues, { 'vars.only': 'x' });
  });

  it('does not confuse a ref with an inherited object property', () => {
    const context = ctx({ vars: { constructor: 'a', toString: 'b' } });
    const condition: Condition = {
      type: 'and',
      conditions: [
        { type: 'exists', ref: 'vars.constructor' },
        { type: 'exists', ref: 'vars.toString' },
      ],
    };

    const { resolvedValues } = new ConditionEvaluator().evaluate(condition, context, { withResolvedValues: true });

    assert.deepStrictEqual(resolvedValues, { 'vars.constructor': 'a', 'vars.toString': 'b' });
  });
});
