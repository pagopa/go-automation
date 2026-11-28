import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { caseSummary } from '../caseSummary.js';
import type { KnownError } from '../../types/KnownError.js';
import type { ErrorTreeNode } from '../../types/ErrorTreeNode.js';
import type { KnownErrorDetection } from '../../types/KnownErrorDetection.js';

function detection(id: string): KnownErrorDetection {
  const knownError: KnownError = {
    code: id,
    description: id,
    condition: { type: 'compare', ref: 'vars.x', operator: '==', value: 'y' },
    action: { type: 'log', level: 'info', title: id },
  };
  return { knownError, evidenceRows: 1, observations: [] };
}

describe('caseSummary', () => {
  it('names each case once, in detection order, with its count when repeated', () => {
    assert.equal(
      caseSummary([detection('timeout'), detection('timeout'), detection('unknown'), detection('timeout')]),
      'timeout ×3, unknown',
    );
  });

  it('counts an error of a tree once, whatever the number of paths that reach it', () => {
    const timeout = detection('timeout');
    const node = (id: string, errorKey: string): ErrorTreeNode => ({
      id,
      level: 1,
      target: 'pn-external-registries',
      key: id,
      errorKey,
      label: id,
      correlation: {},
      descents: [],
      status: 'ok',
      detections: [timeout],
      branchOutcome: 'diagnosed',
    });
    const nodes = [node('a>x', 'row-1'), node('b>x', 'row-1'), node('a>y', 'row-2')];
    assert.equal(caseSummary([timeout, timeout, timeout], nodes), 'timeout ×2');
  });

  it('says none without detections', () => {
    assert.equal(caseSummary([]), 'none');
  });
});
