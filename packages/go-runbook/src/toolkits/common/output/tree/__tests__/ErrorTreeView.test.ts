import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ErrorTreeView } from '../ErrorTreeView.js';
import { CHAINS, DETECTION, LATE, TRACE, TREE } from './errorTreeFixture.js';

const view = new ErrorTreeView({ tree: TREE, chains: CHAINS });

describe('ErrorTreeView', () => {
  it('finds nodes, their paths and the node of a detection', () => {
    assert.equal(view.node('a1')?.key, 'e1');
    assert.deepEqual(
      view.path('a1').map((node) => node.id),
      ['r1', 'a1'],
    );
    assert.equal(view.keyPath('a1'), 'req-1 > e1');
    assert.deepEqual(view.path('missing'), []);
    assert.equal(view.nodeOf(DETECTION)?.id, 'a1');
  });

  it('reads the nodes of a chain, its last node and the representative node', () => {
    const [chain] = CHAINS[1]?.members ?? [];
    if (chain === undefined) throw new Error('fixture');
    assert.deepEqual(
      view.chainNodes(chain).map((node) => node.id),
      ['r1', 'a2'],
    );
    assert.equal(view.last(chain)?.id, 'a2');
    assert.equal(view.representative()?.id, 'a1');
  });

  it('tells recognized, unrecognized and failed nodes apart, and counts each unrecognized leaf once', () => {
    assert.deepEqual(
      TREE.map((node) => view.statusOf(node)),
      ['unrecognized', 'recognized', 'unrecognized', 'failed'],
    );
    assert.equal(view.unrecognizedLeaves(), 1);
  });

  it('counts the interrupted chains by reason', () => {
    assert.deepEqual(
      [...view.interruptions()],
      [
        ['skipped', 1],
        ['cycle', 1],
      ],
    );
    assert.equal(view.hasInterruptedChains(), true);
  });

  it('keeps the levels reached only by a descent, a lower bound only when the descent was not read', () => {
    assert.deepEqual(view.levels({ unit: 'request', observed: 2, examined: 2, lowerBound: true }), [
      { target: 'api-gateway', nodes: 2, recognized: 0, unrecognized: 1, failed: 1, lowerBound: true },
      { target: 'pn-a', nodes: 2, recognized: 1, unrecognized: 1, failed: 0 },
      { target: 'pn-b', nodes: 0, recognized: 0, unrecognized: 0, failed: 0, lowerBound: true },
      { target: 'pn-c', nodes: 0, recognized: 0, unrecognized: 0, failed: 0 },
    ]);
  });

  it('reads the identifiers of a correlation, at the time of the node', () => {
    const root = view.node('r1');
    if (root === undefined) throw new Error('fixture');
    assert.deepEqual(view.correlationObservations(root), [
      { kind: 'requestId', value: 'req-1', observedAt: LATE },
      { kind: 'traceId', value: TRACE, observedAt: LATE },
    ]);
  });

  it('is empty without a tree', () => {
    const empty = new ErrorTreeView({});
    assert.equal(empty.hasTree, false);
    assert.deepEqual(empty.levels(), []);
    assert.equal(empty.representative(), undefined);
    assert.equal(empty.unrecognizedLeaves(), 0);
    assert.equal(empty.hasInterruptedChains(), false);
  });
});
