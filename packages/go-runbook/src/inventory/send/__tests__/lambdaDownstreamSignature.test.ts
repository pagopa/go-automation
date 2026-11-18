import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SEND_MANIFEST } from '../manifest.js';
import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../__tests__/helpers/logRow.js';

const CONTEXT = createTestContext({
  stepResults: {
    'query-lambda-errors': [
      logRow({
        '@timestamp': '2026-11-13T08:00:00.000Z',
        '@requestId': 'c6b49674-286d-424f-8074-5e19a69dc7a8',
        '@message': 'External service pn-emd-integration returned errors { status code 500 }',
      }),
    ],
  },
});

// The SEND downstream signature lives in SEND_LAMBDA_PROFILE, not in the common
// classifier: every SEND Lambda pipeline must keep classifying it.
describe('SEND Lambda runbooks classify the downstream signature', () => {
  it('classifies "External service … returned errors" as a downstream error in every SEND Lambda pipeline', async () => {
    const parseSteps = SEND_MANIFEST.flatMap((registration) => {
      const runbook = registration.build();
      const step = runbook.steps.find(({ step: candidate }) => candidate.id === 'parse-lambda-errors')?.step;
      return step === undefined ? [] : [{ runbookId: runbook.metadata.id, step }];
    });
    assert.ok(parseSteps.length >= 12, `found ${parseSteps.length}`);

    for (const { runbookId, step } of parseSteps) {
      const result = await step.execute(CONTEXT);
      assert.strictEqual(result.success, true, runbookId);
      assert.strictEqual(result.vars?.['lambdaErrorCategory'], 'downstream', runbookId);
    }
  });
});
