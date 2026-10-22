import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GOLogger } from '@go-automation/go-common/core';
import type { ResultField } from '@go-automation/go-common/aws';
import { RunbookBuilder } from '../../builders/RunbookBuilder.js';
import { RunbookEngine } from '../../core/RunbookEngine.js';
import { createTestServiceRegistry } from '../../registry/createTestServiceRegistry.js';
import type { Step } from '../../types/Step.js';
import type { StepEvidence } from '../StepEvidence.js';
import { buildStepEvidence } from '../buildStepEvidence.js';
import { buildRunbookOutput } from '../buildRunbookOutput.js';

function row(values: Record<string, string>): ReadonlyArray<ResultField> {
  return Object.entries(values).map(([field, value]) => ({ field, value }));
}

function step(id = 'query-context'): Step {
  return { id, label: id, kind: 'data', execute: async () => Promise.resolve({ success: true }) };
}

function builder(): RunbookBuilder {
  return RunbookBuilder.create('diagnostics')
    .metadata({
      name: 'Diagnostics',
      description: '',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    })
    .fallback({ type: 'log', level: 'warn', title: 'Unknown' });
}

const LOGS: StepEvidence = {
  id: 'episode',
  label: 'Complete episode',
  type: 'log-sample',
  retention: { mode: 'all' },
};

describe('declared step evidence', () => {
  it('retains the complete episode, chronological duplicates and correlation columns', () => {
    const evidence = buildStepEvidence(
      [{ step: step(), evidence: [LOGS] }],
      new Map([
        [
          'query-context',
          [
            row({
              '@timestamp': '2026-10-21T10:00:02Z',
              log: 'rejoin completed',
              trace_id: 'trace-1',
              pod_app: 'writer',
            }),
            ...Array.from({ length: 7 }, () => row({ '@timestamp': '2026-10-21T10:00:01Z', log: 'restart' })),
          ],
        ],
      ]),
    );
    assert.strictEqual(evidence[0]?.items?.length, 8);
    assert.strictEqual(evidence[0]?.items?.[0]?.['message'], 'restart');
    assert.strictEqual(evidence[0]?.items?.[7]?.['trace_id'], 'trace-1');
    assert.strictEqual(evidence[0]?.items?.[7]?.['pod_app'], 'writer');
    assert.strictEqual(evidence[0]?.truncated, false);
    assert.strictEqual(evidence[0]?.sourceStep, 'query-context');
  });

  it('samples the latest eligible messages and gives configured aliases priority over raw envelopes', () => {
    const evidence = buildStepEvidence(
      [
        {
          step: step(),
          evidence: [
            {
              ...LOGS,
              messageFields: ['log', '@message'],
              retention: { mode: 'latest', limit: 1, timestampField: '@timestamp' },
            },
          ],
        },
      ],
      new Map([
        [
          'query-context',
          [
            row({
              '@timestamp': '2026-10-21T10:00:02Z',
              log: 'recovered',
              '@message': '{raw envelope}',
              trace_id: 'trace-1',
            }),
            row({ '@timestamp': '2026-10-21T10:00:01Z', log: 'restart' }),
            row({ '@timestamp': '2026-10-21T10:00:03Z' }),
          ],
        ],
      ]),
    );
    assert.strictEqual(evidence[0]?.items?.[0]?.['message'], 'recovered');
    assert.strictEqual(evidence[0]?.items?.[0]?.['@message'], '{raw envelope}');
    assert.strictEqual(evidence[0]?.truncated, true);
  });

  it('does not report truncation just because a non-log row has no message', () => {
    const evidence = buildStepEvidence(
      [{ step: step(), evidence: [LOGS] }],
      new Map([['query-context', [row({ '@message': 'error' }), row({ logCount: '42' })]]]),
    );
    assert.strictEqual(evidence[0]?.items?.length, 1);
    assert.strictEqual(evidence[0]?.truncated, false);
  });

  it('splits mixed query output and retains aggregates without message columns', () => {
    const evidence = buildStepEvidence(
      [
        {
          step: step(),
          evidence: [
            {
              id: 'streams',
              label: 'Streams',
              type: 'step-output',
              filter: { field: 'queryKind', equals: 'streams' },
              retention: { mode: 'latest', limit: 1, timestampField: 'lastLog' },
            },
          ],
        },
      ],
      new Map([
        [
          'query-context',
          [
            row({ queryKind: 'errors', '@message': 'error' }),
            row({
              queryKind: 'streams',
              lastLog: '2026-10-21T10:00:01Z',
              firstLog: 'start',
              logCount: '8',
              sourceAccountId: 'a',
            }),
            row({
              queryKind: 'streams',
              lastLog: '2026-10-21T10:00:02Z',
              firstLog: 'start',
              logCount: '42',
              sourceAccountId: 'b',
            }),
          ],
        ],
      ]),
    );
    assert.strictEqual(evidence[0]?.items?.[0]?.['logCount'], '42');
    assert.strictEqual(evidence[0]?.items?.[0]?.['firstLog'], 'start');
    assert.strictEqual(evidence[0]?.items?.[0]?.['sourceAccountId'], 'b');
    assert.strictEqual(evidence[0]?.truncated, true);
  });

  it('omits absent, empty and incompatible outputs instead of manufacturing evidence', () => {
    for (const output of [undefined, [], { requests: [] }]) {
      assert.deepStrictEqual(
        buildStepEvidence([{ step: step(), evidence: [LOGS] }], new Map([['query-context', output]])),
        [],
      );
    }
  });
});

describe('declared runbook output', () => {
  it('composes evidence with family context once and preserves typed zero counts without a custom exporter', async () => {
    const runbook = builder()
      .output({
        metadata: { service: 'worker' },
        fields: [
          { name: 'count', label: 'Count', ref: 'vars.count', valueType: 'integer' },
          { name: 'alarm', label: 'Alarm', ref: 'params.alarmName', valueType: 'string' },
          { name: 'unavailable', label: 'Unavailable', ref: 'vars.unavailable', valueType: 'integer' },
        ],
      })
      .step(
        {
          ...step(),
          execute: async () =>
            Promise.resolve({
              success: true,
              output: [row({ log: 'restart' })],
              vars: { count: '0', unavailable: '12foo' },
            }),
        },
        { evidence: [LOGS] },
      )
      .build();
    const result = await new RunbookEngine(new GOLogger()).execute(
      runbook,
      new Map([['alarmName', 'worker-alarm']]),
      createTestServiceRegistry(),
    );
    const output = buildRunbookOutput(runbook, result, {
      contextBuilder: () => ({
        fields: [{ name: 'service', label: 'Service', value: 'worker' }],
        evidence: [{ id: 'primary', label: 'Primary', type: 'summary' }],
        details: { service: { name: 'worker' } },
      }),
    });
    assert.deepStrictEqual(output.context.details?.['diagnostics'], { count: 0 });
    assert.deepStrictEqual(output.context.details?.['metadata'], { service: 'worker' });
    assert.deepStrictEqual(output.context.details?.['service'], { name: 'worker' });
    assert.deepStrictEqual(
      output.context.evidence.map(({ id }) => id),
      ['primary', 'episode'],
    );
    assert.strictEqual(output.context.fields.length, 3);
    assert.strictEqual(buildRunbookOutput(runbook, result).context.evidence.length, 1);
  });

  it('exports no rows or diagnostic counts from a failed step', async () => {
    const runbook = builder()
      .output({ fields: [{ name: 'count', label: 'Count', ref: 'vars.count', valueType: 'integer' }] })
      .step(
        { ...step(), execute: async () => Promise.resolve({ success: false, error: 'AccessDenied' }) },
        { evidence: [LOGS] },
      )
      .build();
    const result = await new RunbookEngine(new GOLogger()).execute(runbook, new Map(), createTestServiceRegistry());
    const output = buildRunbookOutput(runbook, result);
    assert.strictEqual(output.outcome.kind, 'failed');
    assert.deepStrictEqual(output.context.evidence, []);
    assert.deepStrictEqual(output.context.fields, []);
    assert.deepStrictEqual(output.context.details?.['diagnostics'], {});
  });

  it('omits evidence from steps skipped by early resolution', async () => {
    const runbook = builder()
      .knownCase({
        id: 'known',
        description: 'Known',
        priority: 1,
        condition: { type: 'compare', ref: 'vars.ready', operator: '==', value: 'yes' },
        action: { type: 'log', level: 'info', title: 'Known' },
      })
      .step({
        ...step('first'),
        execute: async () => Promise.resolve({ success: true, vars: { ready: 'yes' }, next: 'resolve' as const }),
      })
      .step(
        {
          ...step(),
          execute: async () => Promise.reject(new Error('This query must not execute')),
        },
        { evidence: [LOGS] },
      )
      .build();
    const result = await new RunbookEngine(new GOLogger()).execute(runbook, new Map(), createTestServiceRegistry());
    assert.strictEqual(result.earlyResolution, true);
    assert.deepStrictEqual(buildRunbookOutput(runbook, result).context.evidence, []);
  });

  it('rejects duplicate evidence ids and invalid retention before executing', () => {
    assert.throws(
      () =>
        builder()
          .step(step(), { evidence: [LOGS] })
          .step(step('second'), { evidence: [LOGS] })
          .build(),
      /Duplicate evidence id/u,
    );
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () =>
          builder()
            .step(step(), {
              evidence: [
                {
                  ...LOGS,
                  retention: { mode: 'latest', limit, timestampField: '@timestamp' },
                },
              ],
            })
            .build(),
        /positive integer limit/u,
      );
    }
    assert.throws(
      () =>
        builder()
          .step(step(), { evidence: [{ ...LOGS, messageFields: [] }] })
          .build(),
      /message aliases/u,
    );
    assert.throws(
      () =>
        builder()
          .step(step(), { evidence: [{ ...LOGS, filter: { field: '', equals: 'errors' } }] })
          .build(),
      /empty filter/u,
    );
  });

  it('rejects duplicate diagnostic fields and empty references', () => {
    const field = { name: 'count', label: 'Count', ref: 'vars.count', valueType: 'integer' } as const;
    assert.throws(
      () =>
        builder()
          .step(step())
          .output({ fields: [field, field] })
          .build(),
      /Duplicate output field/u,
    );
    assert.throws(
      () =>
        builder()
          .step(step())
          .output({ fields: [{ ...field, ref: 'vars.' }] })
          .build(),
      /Invalid output field/u,
    );
  });
});
