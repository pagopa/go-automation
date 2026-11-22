import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { countCoverageByReason } from '../countCoverageByReason.js';

describe('countCoverageByReason', () => {
  it('counts the entries by reason, in first-seen order, an entry without reason as unavailable', () => {
    const counts = countCoverageByReason([{ reason: 'saturated' }, {}, { reason: 'saturated' }, { reason: 'manual' }]);
    assert.deepStrictEqual(
      [...counts],
      [
        ['saturated', 2],
        ['unavailable', 1],
        ['manual', 1],
      ],
    );
    assert.strictEqual(countCoverageByReason([]).size, 0);
  });
});
