import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunbookContext } from '../../types/RunbookContext.js';
import { SEND_SERVICE_PROFILE } from '../../service/profiles/SEND_SERVICE_PROFILE.js';
import { AnalyzeServiceLogsStep } from '../../service/steps/analyzeServiceLogs.js';
import { createTestServiceRegistry } from '../createTestServiceRegistry.js';
import { CollectingRunbookReporter } from '../reporters/CollectingRunbookReporter.js';

function contextWith(reporter: CollectingRunbookReporter, rows: ReadonlyArray<unknown>): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>([['query-pn-foo', rows]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry({ reporter }),
    recoveredErrors: [],
  };
}

describe('a step narrative is a value', () => {
  it('reports the analysis as a node tree, not as formatted lines', async () => {
    const reporter = new CollectingRunbookReporter();
    const step = new AnalyzeServiceLogsStep({
      id: 'analyze',
      label: 'Analisi',
      fromStep: 'query-pn-foo',
      varPrefix: 'foo',
      schema: SEND_SERVICE_PROFILE.schema,
    });

    await step.execute(
      contextWith(reporter, [
        [
          { field: '@timestamp', value: '2026-01-01 00:00:00.000' },
          { field: '@message', value: 'ERROR something broke badly' },
        ],
      ]),
    );

    // No branch characters, no indentation: the assertion is on the shape.
    assert.deepStrictEqual(reporter.nodes, [
      {
        label: 'Analisi log',
        children: [
          { label: 'Errori applicativi: 1' },
          { label: 'Nessun error message rilevato' },
          { label: 'Nessun trace_id rilevato' },
        ],
      },
    ]);
  });
});
