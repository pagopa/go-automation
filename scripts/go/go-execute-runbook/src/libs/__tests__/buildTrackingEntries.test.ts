import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildTrackingEntries } from '../buildTrackingEntries.js';

describe('buildTrackingEntries', () => {
  it('always reserves the final contract slot for the automation execution id', () => {
    const generatedAt = '2026-06-22T10:00:00.000Z';
    const executionId = '0192c000-0000-7000-8000-0000000000e1';
    const entries = buildTrackingEntries({
      generatedAt,
      execution: { executionId },
      context: {
        fields: Array.from({ length: 70 }, (_, index) => ({
          name: `trace-${index}`,
          label: `Trace ${index}`,
          value: `trace-value-${index}`,
        })),
      },
    });

    assert.strictEqual(entries.length, 64);
    assert.strictEqual(entries[62]?.identifierValue, 'trace-value-62');
    assert.deepStrictEqual(entries[63], {
      identifierType: 'AUTOMATION_EXECUTION_ID',
      identifierValue: executionId,
      timestamp: generatedAt,
    });
  });
});
