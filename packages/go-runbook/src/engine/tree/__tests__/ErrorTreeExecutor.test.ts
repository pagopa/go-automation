import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogger } from '@pagopa/go-common/logging';

import { RunbookEngine } from '../../core/RunbookEngine.js';
import type { ErrorNodeSpec } from '../../types/ErrorNodeSpec.js';
import type { ErrorTreeDefinition } from '../../types/ErrorTreeDefinition.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { Condition } from '../../types/Condition.js';
import type { ErrorTreeNode } from '../../types/ErrorTreeNode.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { Step } from '../../types/Step.js';
import type { StepResult } from '../../types/StepResult.js';
import type { TreeLevel } from '../../types/TreeLevel.js';
import type { TreeLevelReader } from '../../types/TreeLevelReader.js';
import type { TreeLevelReadResult } from '../../types/TreeLevelReadResult.js';
import type { EvidenceIdentifier } from '../../types/EvidenceIdentifier.js';
import type { RunbookExecutionResult } from '../../types/RunbookExecutionResult.js';
import { createTestServiceRegistry } from '../../../toolkits/common/testing/createTestServiceRegistry.js';
import { createTestRunbook } from '../../../__tests__/helpers/createTestRunbook.js';

/** An access-log request: `<requestId>|<traceId>|<status>|<time>`. */
const REQUESTS = [
  'r1|T1|500|2026-11-20T10:00:01.000Z',
  'r2|T2|500|2026-11-20T10:00:02.000Z',
  'r3||500|2026-11-20T10:00:03.000Z',
  'r4|T4|500|2026-11-20T10:00:04.000Z',
];

/** Service rows: `<traceId>|<rowId>|<level>|<message>`. */
const SERVICE_ROWS = [
  'T1|e1|ERROR|NullPointerException',
  'T1|e2|ERROR|timeout calling http://down',
  'T1|i1|INFO|request received',
];

/** A step returning a fixed output. */
function outputStep(id: string, output: unknown): Step<unknown> {
  return { id, label: id, kind: 'data', execute: async () => Promise.resolve({ success: true, output }) };
}

/** A per-node step computing its result from the node context. */
/** Computes the result of a step from the context of its node. */
type NodeStepFn = (context: RunbookContext) => StepResult<unknown>;

function nodeStep(id: string, run: NodeStepFn): Step<unknown> {
  return { id, label: id, kind: 'transform', execute: async (context) => Promise.resolve(run(context)) };
}

/** A grouped read over fixed rows, recording the identifiers of every call. */
function fakeReader(
  id: string,
  rows: ReadonlyArray<string>,
  calls: string[][],
  result: Partial<TreeLevelReadResult> = {},
): TreeLevelReader {
  return {
    id,
    label: id,
    kind: 'data',
    read: async (_context: RunbookContext, identifiers: ReadonlyArray<EvidenceIdentifier>) => {
      calls.push(identifiers.map((identifier) => identifier.value));
      const wanted = new Set(identifiers.map((identifier) => identifier.value));
      return Promise.resolve({
        success: true,
        rows: rows.filter((row) => wanted.has(row.split('|')[0] ?? '')),
        ...result,
      });
    },
  };
}

/** The root level: one node per access-log request, descending to `svc` with its trace id. */
function rootLevel(): TreeLevel {
  return {
    target: 'api',
    scopedSteps: ['access'],
    enumerate: ({ context }) => ({
      nodes: (context.stepResults.get('access') as ReadonlyArray<string>).map((row): ErrorNodeSpec => {
        const [requestId = '', traceId = '', status = '', time = ''] = row.split('|');
        return {
          key: requestId,
          label: `${status} ${requestId}`,
          occurredAt: time,
          correlation: { requestId },
          vars: { status, traceId },
          scopedOutputs: { access: [row] },
        };
      }),
      observedErrors: { unit: 'request', observed: 4 },
    }),
    perNode: [
      {
        step: nodeStep('route-root', (context) => ({
          success: true,
          descend: [{ target: 'svc', identifier: { kind: 'traceId', value: context.vars.get('traceId') ?? '' } }],
        })),
      },
    ],
  };
}

/** A service level: one node per error row, context rows for the others, descending to the URL of the error. */
function serviceLevel(reader: TreeLevelReader, overrides: Partial<TreeLevel> = {}): TreeLevel {
  return {
    target: 'svc',
    varPrefix: 'svc',
    read: reader,
    attribute: (identifier) => (row) => String(row).split('|')[0] === identifier.value,
    rowIdentity: (row) => String(row).split('|')[1] ?? '',
    enumerate: ({ rows }) => {
      const errors = rows.filter((row) => String(row).split('|')[2] === 'ERROR');
      return {
        nodes: errors.map((row) => {
          const [, rowId = '', , message = ''] = String(row).split('|');
          return { key: rowId, label: message, vars: { svcErrorMsg: message }, scopedOutputs: { [reader.id]: [row] } };
        }),
        routings: [
          {
            key: 'context',
            label: 'context',
            vars: {
              svcErrorMsg: rows
                .filter((row) => !errors.includes(row))
                .map((row) => String(row))
                .join(' '),
            },
            scopedOutputs: { [reader.id]: rows.filter((row) => !errors.includes(row)) },
          },
        ],
      };
    },
    perNode: [
      {
        step: nodeStep('route-svc', (context) => {
          const target = /http:\/\/(\w+)/u.exec(context.vars.get('svcErrorMsg') ?? '')?.[1];
          return {
            success: true,
            vars: { seenBy: context.vars.get('svcErrorMsg') ?? '' },
            ...(target !== undefined
              ? {
                  descend: [
                    { target, identifier: { kind: 'traceId' as const, value: context.vars.get('traceId') ?? '' } },
                  ],
                }
              : {}),
          };
        }),
      },
    ],
    ownsVar: (name) => name === 'svcErrorMsg',
    ...overrides,
  };
}

function logCase(id: string, condition: Condition, extra: Partial<KnownCase> = {}): KnownCase {
  return { id, description: id, condition, action: { type: 'log', level: 'info', title: id }, ...extra };
}

const CASES: ReadonlyArray<KnownCase> = [
  logCase('root-500', { type: 'compare', ref: 'vars.status', operator: '==', value: '500' }),
  logCase('npe', { type: 'pattern', ref: 'steps.read-svc', regex: 'NullPointer' }),
  logCase('svc-empty', {
    type: 'and',
    conditions: [
      { type: 'compare', ref: 'vars.svcLookupState', operator: '==', value: 'queried' },
      { type: 'compare', ref: 'vars.svcLogCount', operator: '==', value: '0' },
    ],
  }),
];

async function run(
  tree: ErrorTreeDefinition,
  knownCases: ReadonlyArray<KnownCase> = CASES,
): Promise<RunbookExecutionResult> {
  return new RunbookEngine(new GOLogger()).execute(
    createTestRunbook({ steps: [{ step: outputStep('access', REQUESTS) }], knownCases, tree }),
    new Map(),
    createTestServiceRegistry(),
  );
}

function nodeByKey(result: RunbookExecutionResult, key: string): ErrorTreeNode {
  const node = result.tree?.find((candidate) => candidate.key === key);
  assert.ok(node, `node ${key}`);
  return node;
}

describe('ErrorTreeExecutor', () => {
  it('reads a level once for every parent, divides the rows by identifier and publishes the read on each parent', async () => {
    const calls: string[][] = [];
    const downCalls: string[][] = [];
    const result = await run({
      root: rootLevel(),
      levels: [
        serviceLevel(fakeReader('read-svc', SERVICE_ROWS, calls)),
        {
          target: 'down',
          read: fakeReader('read-down', [], downCalls, { success: false, error: 'access denied' }),
          attribute: () => () => true,
          enumerate: () => ({ nodes: [] }),
        },
      ],
    });

    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(calls, [['T1', 'T2', 'T4']]);
    assert.deepStrictEqual(downCalls, [['T1']]);

    const r1 = nodeByKey(result, 'r1');
    assert.deepStrictEqual(
      r1.descents.map((descent) => [descent.target, descent.state, descent.childIds.length, descent.rowCount]),
      [['svc', 'queried', 2, 3]],
    );
    assert.deepStrictEqual(
      nodeByKey(result, 'r3').descents.map((descent) => descent.state),
      ['skipped'],
    );
    const e1 = nodeByKey(result, 'e1');
    assert.deepStrictEqual(
      e1.detections.map((detection) => detection.knownCase.id),
      ['npe'],
    );
    assert.deepStrictEqual(
      nodeByKey(result, 'r2').detections.map((detection) => detection.knownCase.id),
      ['root-500', 'svc-empty'],
    );
    assert.deepStrictEqual(result.observedErrors, { unit: 'request', observed: 4, examined: 4 });
    assert.deepStrictEqual(
      result.coverage.map((entry) => [entry.stepId, entry.reason]),
      [
        ['read-svc', 'skipped'],
        ['read-down', 'unavailable'],
      ],
    );
  });

  it('builds the chains, groups the identical ones and runs each case action once per group from its node', async () => {
    const result = await run({
      root: rootLevel(),
      levels: [
        serviceLevel(fakeReader('read-svc', SERVICE_ROWS, [])),
        {
          target: 'down',
          read: fakeReader('read-down', [], [], { success: false, error: 'access denied' }),
          attribute: () => () => true,
          enumerate: () => ({ nodes: [] }),
        },
      ],
    });

    const summary = (result.chains ?? []).map((group) => [
      group.members.map((member) => member.nodeIds.map((id) => id.split(':').at(-1)).join('>')).join(','),
      group.members[0]?.end,
      group.members[0]?.interruption?.reason ?? '',
    ]);
    assert.deepStrictEqual(summary, [
      ['r1>e1', 'leaf', ''],
      ['r1>e2', 'interrupted', 'unavailable'],
      ['r2,r4', 'leaf', ''],
      ['r3', 'interrupted', 'skipped'],
    ]);
    // root-500 once per group (r1 in both of its groups, r2, r3); npe; svc-empty on the oldest member r2.
    assert.deepStrictEqual(
      result.trace.actionsExecuted.map((action) =>
        action.actionDetail.type === 'log' ? action.actionDetail.title : '',
      ),
      ['root-500', 'npe', 'root-500', 'root-500', 'svc-empty', 'root-500'],
    );
  });

  it('keeps what a node writes in the node and publishes the outcome of each branch', async () => {
    const result = await run(
      {
        root: rootLevel(),
        levels: [
          serviceLevel(fakeReader('read-svc', SERVICE_ROWS, [])),
          {
            target: 'down',
            read: fakeReader('read-down', [], []),
            attribute: () => () => true,
            enumerate: () => ({ nodes: [] }),
          },
        ],
      },
      [
        ...CASES,
        logCase('undiagnosed-branch', {
          type: 'and',
          conditions: [
            { type: 'compare', ref: 'vars.branchOutcome', operator: '==', value: 'undiagnosed' },
            { type: 'exists', ref: 'vars.svcErrorMsg' },
          ],
        }),
      ],
    );

    assert.strictEqual(nodeByKey(result, 'r1').branchOutcome, 'diagnosed');
    assert.strictEqual(nodeByKey(result, 'r2').branchOutcome, 'undiagnosed');
    assert.strictEqual(nodeByKey(result, 'r3').branchOutcome, 'incomplete');
    // e2 descended to a complete empty read: its branch is complete and without diagnosis.
    assert.deepStrictEqual(
      nodeByKey(result, 'e2').detections.map((detection) => detection.knownCase.id),
      ['undiagnosed-branch'],
    );
    const evaluations = result.trace.caseMatching.evaluations.filter((evaluation) => evaluation.caseId === 'npe');
    assert.ok(evaluations.every((evaluation) => evaluation.nodeId?.includes('svc:') === true));
  });

  it('follows the context rows to a level an error branch does not cover, through the traversed service', async () => {
    const extCalls: string[][] = [];
    const result = await run({
      root: rootLevel(),
      levels: [
        serviceLevel(fakeReader('read-svc', [...SERVICE_ROWS, 'T2|i2|INFO|forwarded to http://ext'], [])),
        {
          target: 'ext',
          read: fakeReader('read-ext', ['T2|x1|ERROR|checkout timeout'], extCalls),
          attribute: (identifier) => (row) => String(row).startsWith(identifier.value),
          enumerate: ({ rows }) => ({
            nodes: rows.map((row) => ({ key: 'x1', label: String(row), scopedOutputs: { 'read-ext': [row] } })),
          }),
        },
      ],
    });

    assert.deepStrictEqual(extCalls, [['T2']]);
    const x1 = nodeByKey(result, 'x1');
    assert.deepStrictEqual(x1.via, ['svc']);
    assert.strictEqual(x1.parentId, nodeByKey(result, 'r2').id);
  });

  it('closes a repeated descent as a cycle and merges a second attempt by row identity', async () => {
    const calls: string[][] = [];
    const result = await run({
      root: rootLevel(),
      levels: [
        serviceLevel(fakeReader('read-svc', [...SERVICE_ROWS, 'T1b|e1|ERROR|NullPointerException'], calls), {
          // The first read finds a better identifier for T1: the same level is read again and the rows merged.
          secondAttempt: (_rows, identifier) =>
            identifier.value === 'T1' ? { kind: 'traceId', value: 'T1b' } : undefined,
          perNode: [
            {
              step: nodeStep('loop', (context) => ({
                success: true,
                descend: [{ target: 'svc', identifier: { kind: 'traceId', value: context.vars.get('traceId') ?? '' } }],
              })),
            },
          ],
        }),
      ],
    });

    assert.deepStrictEqual(calls, [['T1', 'T2', 'T4'], ['T1b']]);
    // e1 came from both attempts: one node.
    assert.strictEqual(result.tree?.filter((node) => node.key === 'e1').length, 1);
    assert.deepStrictEqual(
      nodeByKey(result, 'e1').descents.map((descent) => descent.state),
      ['cycle'],
    );
  });

  it('publishes an exclusion as present, absent or unknown on each parent', async () => {
    const result = await run(
      {
        root: rootLevel(),
        levels: [
          serviceLevel(fakeReader('read-svc', SERVICE_ROWS, []), {
            exclusions: [{ name: 'npe', condition: { type: 'pattern', ref: 'steps.read-svc', regex: 'NullPointer' } }],
            perNode: [],
          }),
        ],
      },
      [
        logCase('no-npe-below', { type: 'compare', ref: 'vars.svcExclusion.npe', operator: '==', value: 'absent' }),
        logCase('npe-below', { type: 'compare', ref: 'vars.svcExclusion.npe', operator: '==', value: 'present' }),
      ],
    );

    assert.deepStrictEqual(
      ['r1', 'r2', 'r3'].map((key) => nodeByKey(result, key).detections.map((detection) => detection.knownCase.id)),
      [['npe-below'], ['no-npe-below'], []],
    );
  });

  it('stops the chain at a node whose step fails, keeping its cases', async () => {
    const result = await run({
      root: rootLevel(),
      levels: [
        serviceLevel(fakeReader('read-svc', SERVICE_ROWS, []), {
          perNode: [{ step: nodeStep('broken', () => ({ success: false, error: 'boom' })) }],
        }),
      ],
    });

    const e1 = nodeByKey(result, 'e1');
    assert.strictEqual(e1.status, 'failed');
    assert.deepStrictEqual(
      e1.detections.map((detection) => detection.knownCase.id),
      ['npe'],
    );
    const failedChain = result.chains?.find((group) => group.members[0]?.nodeIds.includes(e1.id));
    assert.deepStrictEqual(failedChain?.members[0]?.interruption, { reason: 'failed', target: 'svc' });
    assert.strictEqual(result.status, 'completed');
  });

  it('marks incomplete only the chain of the descent that failed, and the level of the parent unavailable', async () => {
    const reader: TreeLevelReader = {
      ...fakeReader('read-svc', SERVICE_ROWS, []),
      // The fallback UUIDs are read by a batch of their own, which fails.
      read: async (context, identifiers) =>
        identifiers[0]?.kind === 'fallbackUuid'
          ? Promise.resolve({ success: false, error: 'boom', rows: [] })
          : fakeReader('read-svc', SERVICE_ROWS, []).read(context, identifiers),
    };
    const root: TreeLevel = {
      ...rootLevel(),
      perNode: [
        {
          step: nodeStep('route-root', (context) => ({
            success: true,
            descend:
              context.vars.get('traceId') === 'T1'
                ? [
                    { target: 'svc', identifier: { kind: 'traceId', value: 'T1' } },
                    { target: 'svc', identifier: { kind: 'fallbackUuid', value: 'U1' } },
                  ]
                : [],
          })),
        },
      ],
    };
    const result = await run({ root, levels: [serviceLevel(reader, { perNode: [] })] });

    const r1 = nodeByKey(result, 'r1');
    assert.deepStrictEqual(
      r1.descents.map((descent) => [descent.identifier.kind, descent.state]),
      [
        ['traceId', 'queried'],
        ['fallbackUuid', 'unavailable'],
      ],
    );
    assert.strictEqual(result.nodeContexts?.get(r1.id)?.vars.get('svcLookupState'), 'unavailable');
    const chains = (result.chains ?? [])
      .flatMap((group) => group.members)
      .filter((chain) => chain.nodeIds[0] === r1.id);
    assert.deepStrictEqual(
      chains.map((chain) => [chain.end, chain.interruption?.reason, chain.incompleteEvidence]),
      [
        ['leaf', undefined, false],
        ['leaf', undefined, false],
        ['interrupted', 'unavailable', true],
      ],
    );
  });

  it('marks the original descent incomplete when a second attempt with a new identifier saturates', async () => {
    const reader: TreeLevelReader = {
      ...fakeReader('read-svc', [...SERVICE_ROWS, 'T1b|e3|ERROR|late'], []),
      read: async (context, identifiers) => {
        const result = await fakeReader('read-svc', [...SERVICE_ROWS, 'T1b|e3|ERROR|late'], []).read(
          context,
          identifiers,
        );
        const saturated = identifiers.some((identifier) => identifier.value === 'T1b');
        return saturated ? { ...result, coverage: [{ complete: false, reason: 'saturated' }] } : result;
      },
    };
    const result = await run({
      root: rootLevel(),
      levels: [
        serviceLevel(reader, {
          perNode: [],
          secondAttempt: (_rows, identifier) =>
            identifier.value === 'T1' ? { kind: 'traceId', value: 'T1b' } : undefined,
        }),
      ],
    });

    const r1 = nodeByKey(result, 'r1');
    assert.deepStrictEqual(
      r1.descents.map((descent) => descent.state),
      ['saturated'],
    );
    const chains = (result.chains ?? [])
      .flatMap((group) => group.members)
      .filter((chain) => chain.nodeIds[0] === r1.id);
    assert.ok(chains.length > 0);
    assert.ok(chains.every((chain) => chain.incompleteEvidence));
  });

  it('leaves the children of a skipped read incomplete even when it returned rows', async () => {
    const result = await run({
      root: rootLevel(),
      levels: [
        serviceLevel(fakeReader('read-svc', SERVICE_ROWS, [], { coverage: [{ complete: false, reason: 'skipped' }] }), {
          perNode: [],
        }),
      ],
    });

    const r1 = nodeByKey(result, 'r1');
    assert.deepStrictEqual(
      r1.descents.map((descent) => [descent.state, descent.childIds.length]),
      [['skipped', 2]],
    );
    assert.strictEqual(result.nodeContexts?.get(r1.id)?.vars.get('svcLookupState'), 'skipped');
    const chains = (result.chains ?? [])
      .flatMap((group) => group.members)
      .filter((chain) => chain.nodeIds[0] === r1.id);
    assert.ok(chains.length > 0);
    assert.ok(chains.every((chain) => chain.incompleteEvidence));
  });

  for (const before of ['queried', 'saturated', 'skipped'] as const) {
    it(`degrades only a complete read when a routing fails (read ${before})`, async () => {
      const coverage = before === 'queried' ? [] : [{ complete: false, reason: before } as const];
      const symptom = logCase('svc-undiagnosed', {
        type: 'and',
        conditions: [
          { type: 'compare', ref: 'vars.svcLookupState', operator: '==', value: 'queried' },
          { type: 'compare', ref: 'vars.branchOutcome', operator: '==', value: 'undiagnosed' },
        ],
      });
      const result = await run(
        {
          root: rootLevel(),
          levels: [
            serviceLevel(fakeReader('read-svc', SERVICE_ROWS, [], { coverage }), {
              exclusions: [
                { name: 'npe', condition: { type: 'pattern', ref: 'steps.read-svc', regex: 'NullPointer' } },
                { name: 'none', condition: { type: 'pattern', ref: 'steps.read-svc', regex: 'never-there' } },
              ],
              perNode: [
                {
                  // The routing of the context rows of T1 fails.
                  step: nodeStep('route-svc', (context) =>
                    (context.vars.get('svcErrorMsg') ?? '').includes('request received')
                      ? { success: false, error: 'routing failed' }
                      : { success: true },
                  ),
                },
              ],
            }),
          ],
        },
        [symptom],
      );

      const r1 = nodeByKey(result, 'r1');
      const vars = result.nodeContexts?.get(r1.id)?.vars;
      const after = before === 'queried' ? 'unavailable' : before;
      assert.deepStrictEqual(
        r1.descents.map((descent) => [descent.state, descent.rowCount]),
        [[after, 3]],
      );
      assert.strictEqual(vars?.get('svcLookupState'), after);
      assert.strictEqual(vars?.get('svcLogCount'), '3');
      assert.strictEqual(vars?.get('svcExclusion.npe'), 'present');
      assert.strictEqual(vars?.get('svcExclusion.none'), 'unknown');
      assert.deepStrictEqual(r1.detections, []);
      const chains = (result.chains ?? [])
        .flatMap((group) => group.members)
        .filter((chain) => chain.nodeIds[0] === r1.id);
      assert.ok(chains.every((chain) => chain.incompleteEvidence));
      // The routing step failed in a scope of its own: the nodes of the level are not failed.
      assert.ok(chains.every((chain) => chain.interruption === undefined));
    });
  }

  it('makes every node that reuses a shared read incomplete, with one coverage entry', async () => {
    const shared: StepResult<unknown> = {
      success: true,
      output: [],
      coverage: [{ source: 'probe', complete: false, reason: 'saturated' }],
    };
    const root: TreeLevel = {
      ...rootLevel(),
      perNode: [{ step: nodeStep('probe', () => shared) }],
    };
    const result = await run({ root, levels: [] });

    const roots = (result.tree ?? []).filter((node) => node.parentId === undefined);
    assert.strictEqual(roots.length, 4);
    assert.ok(roots.every((node) => node.incompleteEvidence === true));
    assert.deepStrictEqual(
      result.coverage.map((entry) => [entry.stepId, entry.source]),
      [['probe', 'probe']],
    );
    assert.strictEqual(result.windowIncomplete, false);
  });
});
