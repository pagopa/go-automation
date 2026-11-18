import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SEND_SERVICE_PROFILE } from '../../../toolkits/send/families/service/profiles/SEND_SERVICE_PROFILE.js';
import { AnalyzeApplicationLogsStep } from '../../../toolkits/common/families/service/steps/AnalyzeApplicationLogsStep.js';
import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../__tests__/helpers/logRow.js';
import { CollectingRunbookReporter } from '../CollectingRunbookReporter.js';

describe('a step narrative is a value', () => {
  it('reports the analysis as a node tree, not as formatted lines', async () => {
    const reporter = new CollectingRunbookReporter();
    const step = new AnalyzeApplicationLogsStep({
      id: 'analyze',
      label: 'Analisi',
      fromStep: 'query-pn-foo',
      varPrefix: 'foo',
      schema: SEND_SERVICE_PROFILE.schema,
    });

    await step.execute(
      createTestContext({
        stepResults: {
          'query-pn-foo': [
            logRow({ '@timestamp': '2026-01-01 00:00:00.000', '@message': 'ERROR something broke badly' }),
          ],
        },
        services: { reporter },
      }),
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
