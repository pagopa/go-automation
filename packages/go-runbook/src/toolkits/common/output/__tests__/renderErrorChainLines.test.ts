import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ErrorChainGroup } from '../ErrorChainGroup.js';
import { renderErrorChainLines } from '../renderErrorChainLines.js';

function group(partial: Partial<ErrorChainGroup>): ErrorChainGroup {
  return {
    nodes: [
      { level: 0, target: 'api-gateway', label: '502 GET /a', caseIds: [], status: 'unrecognized' },
      {
        level: 1,
        target: 'pn-a',
        label: 'timeout',
        description: 'Timeout di pn-a',
        caseIds: ['c1'],
        status: 'recognized',
      },
    ],
    end: 'leaf',
    interruptions: [],
    incompleteEvidence: false,
    count: 1,
    firstSeenAt: '2026-01-01T10:15:00.000Z',
    routes: [],
    samples: [],
    members: [],
    observations: [],
    ...partial,
  };
}

describe('renderErrorChainLines', () => {
  it('writes the time, the unrecognized and the recognized nodes', () => {
    assert.deepEqual(renderErrorChainLines([group({})]), [
      '10:15 ? (502 GET /a in api-gateway) → Timeout di pn-a: timeout',
    ]);
  });

  it('shows one route inline and several routes with their counts', () => {
    const inline = group({ routes: [{ via: [['pn-x']], count: 1 }] });
    assert.match(renderErrorChainLines([inline])[0] ?? '', /\(via pn-x\) → Timeout di pn-a/u);
    const several = group({
      count: 3,
      lastSeenAt: '2026-01-01T10:20:00.000Z',
      routes: [{ via: [['pn-x']], count: 2 }],
    });
    assert.match(
      renderErrorChainLines([several])[0] ?? '',
      /\(3 volte, fino alle 10:20\) \[via pn-x: 2; diretta: 1\]$/u,
    );
  });

  it('names where and why a chain stopped', () => {
    const stopped = group({ end: 'interrupted', interruptions: [{ reason: 'skipped', target: 'pn-b', count: 1 }] });
    assert.match(renderErrorChainLines([stopped])[0] ?? '', /→ \(pn-b: non interrogato, identificatore mancante\)$/u);
  });
});
