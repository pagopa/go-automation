import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { logSampleEvidence } from '../logSampleEvidence.js';

const SAMPLE = {
  id: 'lambda-recent-errors',
  label: 'Ultimi errori Lambda',
  sourceStep: 'query-lambda-errors',
  logs: [{ timestamp: '2026-01-01T00:00:00.000Z', message: 'boom' }],
  totalRows: 3,
};

describe('logSampleEvidence', () => {
  it('describes the lines as a log sample, truncated when the step read more rows than it keeps', () => {
    assert.deepStrictEqual(logSampleEvidence(SAMPLE, 2), [
      {
        id: 'lambda-recent-errors',
        label: 'Ultimi errori Lambda',
        type: 'log-sample',
        sourceStep: 'query-lambda-errors',
        items: [{ timestamp: '2026-01-01T00:00:00.000Z', message: 'boom' }],
        truncated: true,
      },
    ]);
    assert.strictEqual(logSampleEvidence(SAMPLE, 3)[0]?.truncated, false);
  });

  it('gives no evidence without lines', () => {
    assert.deepStrictEqual(logSampleEvidence({ ...SAMPLE, logs: [] }, 5), []);
  });
});
