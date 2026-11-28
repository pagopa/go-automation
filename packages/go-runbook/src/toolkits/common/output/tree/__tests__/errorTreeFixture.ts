import type { ErrorTreeNode } from '../../../../../engine/types/ErrorTreeNode.js';
import type { KnownError } from '../../../../../engine/types/KnownError.js';
import type { KnownErrorDetection } from '../../../../../engine/types/KnownErrorDetection.js';
import type { RunbookExecutionResult } from '../../../../../engine/types/RunbookExecutionResult.js';
import type { TreeChainGroup } from '../../../../../engine/types/TreeChainGroup.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { createTestExecutionResult } from '../../../../../__tests__/helpers/createTestExecutionResult.js';

export const TRACE = '1-6789abcd-0123456789abcdef01234567';
export const EARLY = '2026-01-01T00:00:00.000Z';
export const LATE = '2026-01-01T00:05:00.000Z';

function knownError(id: string): KnownError {
  return {
    code: id,
    description: `Caso ${id}`,
    condition: { type: 'compare', ref: 'vars.x', operator: '==', value: 'y' },
    action: { type: 'log', level: 'info', title: id },
  };
}

/** The detection of the node `a1`: it observed `req-1` before the root did. */
export const DETECTION: KnownErrorDetection = {
  knownError: knownError('c1'),
  evidenceRows: 1,
  observations: [{ kind: 'requestId', value: 'req-1', observedAt: EARLY }],
};

function node(partial: Partial<ErrorTreeNode> & Pick<ErrorTreeNode, 'id' | 'target' | 'key'>): ErrorTreeNode {
  return {
    level: partial.parentId === undefined ? 0 : 1,
    errorKey: partial.id,
    label: partial.key,
    correlation: {},
    descents: [],
    status: 'ok',
    detections: [],
    branchOutcome: 'undiagnosed',
    ...partial,
  };
}

/**
 * Two roots: `r1` with a recognized child `a1` (whose descent to `pn-b` was skipped) and an unrecognized leaf `a2`
 * (whose descent to `pn-c` was read and found nothing); `r2` failed. Four groups: `r1 > a1`, twice `r1 > a2`,
 * `r1 > a1` interrupted at `pn-b`, `r2` interrupted by a cycle.
 */
export const TREE: ReadonlyArray<ErrorTreeNode> = [
  node({
    id: 'r1',
    target: 'api-gateway',
    key: 'req-1',
    occurredAt: LATE,
    correlation: { requestId: 'req-1', traceId: TRACE, other: 'x' },
    descents: [
      {
        target: 'pn-a',
        identifier: { kind: 'traceId', value: TRACE },
        state: 'queried',
        childIds: ['a1', 'a2'],
        rowCount: 2,
      },
    ],
  }),
  node({
    id: 'a1',
    parentId: 'r1',
    target: 'pn-a',
    key: 'e1',
    detections: [DETECTION],
    descents: [
      { target: 'pn-b', identifier: { kind: 'traceId', value: '' }, state: 'skipped', childIds: [], rowCount: 0 },
    ],
  }),
  node({
    id: 'a2',
    parentId: 'r1',
    target: 'pn-a',
    key: 'e2',
    descents: [
      { target: 'pn-c', identifier: { kind: 'traceId', value: TRACE }, state: 'queried', childIds: [], rowCount: 0 },
    ],
  }),
  node({ id: 'r2', target: 'api-gateway', key: 'req-2', status: 'failed' }),
];

export const CHAINS: ReadonlyArray<TreeChainGroup> = [
  { key: 'g1', members: [{ nodeIds: ['r1', 'a1'], end: 'leaf', incompleteEvidence: false }] },
  {
    key: 'g2',
    members: [
      { nodeIds: ['r1', 'a2'], end: 'leaf', incompleteEvidence: false },
      { nodeIds: ['r1', 'a2'], end: 'leaf', incompleteEvidence: false },
    ],
  },
  {
    key: 'g3',
    members: [
      {
        nodeIds: ['r1', 'a1'],
        end: 'interrupted',
        interruption: { reason: 'skipped', target: 'pn-b' },
        incompleteEvidence: true,
      },
    ],
  },
  {
    key: 'g4',
    members: [{ nodeIds: ['r2'], end: 'interrupted', interruption: { reason: 'cycle' }, incompleteEvidence: true }],
  },
];

/** A result with the fixture tree, its chains and a context for each node. */
export function treeResult(): RunbookExecutionResult {
  const base = createTestExecutionResult({ stepResults: { window: 'w', shared: 'final' } });
  return {
    ...base,
    detections: [DETECTION],
    tree: TREE,
    chains: CHAINS,
    nodeContexts: new Map([
      ['r1', createTestContext({ vars: { at: 'r1' }, stepResults: { root: 'r1', shared: 'r1' } })],
      ['a1', createTestContext({ vars: { at: 'a1' }, stepResults: { node: 'a1', shared: 'a1' } })],
    ]),
  };
}
