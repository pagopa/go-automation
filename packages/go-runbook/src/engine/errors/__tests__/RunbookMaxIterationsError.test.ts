import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RunbookMaxIterationsError } from '../RunbookMaxIterationsError.js';

describe('RunbookMaxIterationsError', () => {
  it('reports the limit, the last step and only the last ten visited steps', () => {
    const visited = Array.from({ length: 12 }, (_, index) => `s${index + 1}`);

    const error = new RunbookMaxIterationsError('rb-1', 100, 's12', visited);

    assert.ok(error instanceof RunbookMaxIterationsError);
    assert.ok(error instanceof Error);
    assert.strictEqual(error.name, 'RunbookMaxIterationsError');
    assert.strictEqual(error.runbookId, 'rb-1');
    assert.strictEqual(error.maxIterations, 100);
    assert.strictEqual(error.lastStepId, 's12');
    assert.deepStrictEqual(error.visitedSequence, visited);
    assert.strictEqual(
      error.message,
      'Runbook "rb-1" exceeded the limit of 100 iterations. Last step: "s12". Possible infinite loop detected. ' +
        'Last visited steps: [s3 -> s4 -> s5 -> s6 -> s7 -> s8 -> s9 -> s10 -> s11 -> s12]',
    );
  });
});
