import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ErrorChainGroup } from '../ErrorChainGroup.js';
import { renderErrorChainLines, renderErrorChainTree } from '../renderErrorChainLines.js';

function group(partial: Partial<ErrorChainGroup>): ErrorChainGroup {
  return {
    nodes: [
      { level: 0, target: 'api-gateway', label: '502 GET /a', knownErrorCodes: [], status: 'unrecognized' },
      {
        level: 1,
        target: 'pn-a',
        label: 'timeout',
        description: 'Timeout di pn-a',
        knownErrorCodes: ['c1'],
        status: 'recognized',
      },
    ],
    end: 'leaf',
    interruptions: [],
    incompleteEvidence: false,
    count: 1,
    errors: partial.count ?? 1,
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

describe('renderErrorChainTree', () => {
  it('shows when and how many times, then each node with its service and the text of its log', () => {
    const seen = group({ count: 3, lastSeenAt: '2026-01-01T10:20:00.000Z' });
    assert.deepEqual(renderErrorChainTree([seen]), [
      {
        label: '10:15 → 10:20 · 3 volte',
        children: [
          { label: '? non riconosciuto', children: [{ label: 'api-gateway · 502 GET /a' }] },
          { label: '✓ Timeout di pn-a', children: [{ label: 'pn-a · timeout' }] },
        ],
      },
    ]);
  });

  it('puts a single node on the branch, without the service of a window runbook', () => {
    const window = group({
      nodes: [
        { level: 0, target: 'window', label: 'Client assertion scaduta', knownErrorCodes: ['c'], status: 'recognized' },
      ],
      count: 2,
      lastSeenAt: '2026-01-01T10:15:30.000Z',
    });
    assert.deepEqual(renderErrorChainTree([window]), [
      { label: '10:15 ✓ Client assertion scaduta (2 volte)', children: [] },
    ]);
  });

  it('reads the message of a JSON log, also cut, and shortens a long detail', () => {
    const { firstSeenAt: _time, ...json } = group({
      nodes: [
        {
          level: 0,
          target: 'pn-trace',
          label:
            '{"@timestamp":"2026-01-01T10:15:00Z","message":"can not \\"retrieve\\" address","logger_name":"it.pagopa',
          knownErrorCodes: [],
          status: 'unrecognized',
        },
        {
          level: 1,
          target: 'pn-cut',
          label: '{"@version":"1","message":"Generic exception for iun',
          knownErrorCodes: [],
          status: 'failed',
        },
      ],
    });
    const [branch] = renderErrorChainTree([json], { maxDetailLength: 20 });
    assert.equal(branch?.label, '1 volta');
    assert.deepEqual(
      branch?.children?.map((node) => node.children?.[0]?.label),
      ['pn-trace · can not …', 'pn-cut · Generic ex…'],
    );
    assert.deepEqual(
      renderErrorChainTree([json])[0]?.children?.map((node) => node.children?.[0]?.label),
      ['pn-trace · can not "retrieve" address', 'pn-cut · Generic exception for iun'],
    );
  });

  it('adds the routes and where the chain stopped after the nodes', () => {
    const routed = group({
      count: 3,
      routes: [{ via: [['pn-x']], count: 2 }],
      end: 'interrupted',
      interruptions: [{ reason: 'skipped', target: 'pn-b', count: 1 }],
    });
    assert.deepEqual(renderErrorChainTree([routed])[0]?.children?.slice(2), [
      { label: 'via pn-x: 2; diretta: 1' },
      { label: '⋯ pn-b: non interrogato, identificatore mancante' },
    ]);
    const inline = group({ routes: [{ via: [['pn-x', 'pn-y']], count: 1 }] });
    assert.deepEqual(renderErrorChainTree([inline])[0]?.children?.[2], { label: 'via pn-x, pn-y' });
  });
  it('shows the errors of a group and, when an error is reached by more than one path, the paths too', () => {
    const copies = group({ count: 4575, errors: 45, lastSeenAt: '2026-01-01T10:20:00.000Z' });

    assert.deepStrictEqual(renderErrorChainLines([copies]), [
      '10:15 ? (502 GET /a in api-gateway) → Timeout di pn-a: timeout (45 volte, 4575 percorsi, fino alle 10:20)',
    ]);
    assert.strictEqual(renderErrorChainTree([copies])[0]?.label, '10:15 → 10:20 · 45 volte, 4575 percorsi');
  });
});
