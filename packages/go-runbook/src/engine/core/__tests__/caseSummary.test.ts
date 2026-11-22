import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { caseSummary } from '../caseSummary.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { KnownCaseDetection } from '../../types/KnownCaseDetection.js';

function detection(id: string): KnownCaseDetection {
  const knownCase: KnownCase = {
    id,
    description: id,
    condition: { type: 'compare', ref: 'vars.x', operator: '==', value: 'y' },
    action: { type: 'log', level: 'info', title: id },
  };
  return { knownCase, evidenceRows: 1, observations: [] };
}

describe('caseSummary', () => {
  it('names each case once, in detection order, with its count when repeated', () => {
    assert.equal(
      caseSummary([detection('timeout'), detection('timeout'), detection('unknown'), detection('timeout')]),
      'timeout ×3, unknown',
    );
  });

  it('says none without detections', () => {
    assert.equal(caseSummary([]), 'none');
  });
});
