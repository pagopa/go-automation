import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import type { Step } from '../../types/Step.js';
import { CollectingRunbookReporter } from '../CollectingRunbookReporter.js';

describe('a step narrative is a value', () => {
  it('reports a node tree, not formatted lines', async () => {
    const reporter = new CollectingRunbookReporter();
    const step: Step<void> = {
      id: 'analyze',
      label: 'Analisi',
      kind: 'transform',
      execute: async (context) => {
        context.services.reporter.add({
          label: 'Analisi log',
          children: [{ label: 'Errori applicativi: 1' }, { label: 'Nessun trace_id rilevato' }],
        });
        return Promise.resolve({ success: true });
      },
    };

    await step.execute(createTestContext({ services: { reporter } }));

    // No branch characters, no indentation: the assertion is on the shape.
    assert.deepStrictEqual(reporter.nodes, [
      {
        label: 'Analisi log',
        children: [{ label: 'Errori applicativi: 1' }, { label: 'Nessun trace_id rilevato' }],
      },
    ]);
  });
});
