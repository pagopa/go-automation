import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GoToGraphAnalyzer } from '../GoToGraphAnalyzer.js';

describe('GoToGraphAnalyzer', () => {
  it('finds no cycle in a linear pipeline or with forward jumps', () => {
    assert.deepStrictEqual(GoToGraphAnalyzer.detectCycles(['a', 'b', 'c'], []), []);
    assert.deepStrictEqual(GoToGraphAnalyzer.detectCycles(['a', 'b', 'c'], [{ sourceId: 'a', targetId: 'c' }]), []);
  });

  it('detects a backward goTo as a cycle through the sequential edges', () => {
    const cycles = GoToGraphAnalyzer.detectCycles(['a', 'b', 'c'], [{ sourceId: 'c', targetId: 'a' }]);

    assert.deepStrictEqual(cycles, [['a', 'b', 'c', 'a']]);
  });

  it('detects a self loop', () => {
    assert.deepStrictEqual(GoToGraphAnalyzer.detectCycles(['a', 'b'], [{ sourceId: 'b', targetId: 'b' }]), [
      ['b', 'b'],
    ]);
  });

  it('ignores references from unknown steps', () => {
    assert.deepStrictEqual(GoToGraphAnalyzer.detectCycles(['a', 'b'], [{ sourceId: 'missing', targetId: 'a' }]), []);
  });
});
