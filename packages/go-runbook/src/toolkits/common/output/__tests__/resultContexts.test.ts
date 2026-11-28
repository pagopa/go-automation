import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectionContext, detectionObservations, representativeContext } from '../resultContexts.js';
import { ErrorTreeView } from '../tree/ErrorTreeView.js';
import { CHAINS, DETECTION, EARLY, LATE, TRACE, TREE, treeResult } from '../tree/__tests__/errorTreeFixture.js';
import type { KnownErrorDetection } from '../../../../engine/types/KnownErrorDetection.js';

describe('resultContexts', () => {
  it('gives a node its variables and the step results of the window and of its path, its own last', () => {
    const result = treeResult();
    const context = representativeContext(result, new ErrorTreeView(result));
    assert.equal(context.vars.get('at'), 'a1');
    assert.deepEqual(Object.fromEntries(context.stepResults), { window: 'w', shared: 'a1', root: 'r1', node: 'a1' });
  });

  it('uses the final context for a detection of the window', () => {
    const result = treeResult();
    const window: KnownErrorDetection = { ...DETECTION, observations: [] };
    assert.equal(detectionContext(result, new ErrorTreeView(result), window), result.finalContext);
  });

  it('merges the observations of a detection with the correlation of its path, the earliest of each value', () => {
    const result = treeResult();
    const view = new ErrorTreeView(result);
    assert.deepEqual(detectionObservations(view, DETECTION), [
      { kind: 'requestId', value: 'req-1', observedAt: EARLY },
      { kind: 'traceId', value: TRACE, observedAt: LATE },
    ]);
  });

  it('gives a detection without observations of its own the correlation of its path', () => {
    const bare: KnownErrorDetection = { ...DETECTION, observations: [] };
    const view = new ErrorTreeView({
      tree: TREE.map((node) => (node.id === 'a1' ? { ...node, detections: [bare] } : node)),
      chains: CHAINS,
    });
    assert.deepEqual(detectionObservations(view, bare), [
      { kind: 'requestId', value: 'req-1', observedAt: LATE },
      { kind: 'traceId', value: TRACE, observedAt: LATE },
    ]);
  });
});
