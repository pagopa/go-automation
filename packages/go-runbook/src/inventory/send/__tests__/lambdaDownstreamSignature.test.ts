import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestServiceRegistry } from '../../../toolkits/send/index.js';
import type { RunbookContext } from '../../../engine/index.js';
import { SEND_MANIFEST } from '../manifest.js';

const DOWNSTREAM_MESSAGE = 'External service pn-emd-integration returned errors { status code 500 }';

function contextWithErrorRow(message: string): RunbookContext {
  return {
    executionId: 'lambda-signature-test',
    startedAt: new Date('2026-11-13T08:00:00.000Z'),
    stepResults: new Map([
      [
        'query-lambda-errors',
        [
          [
            { field: '@timestamp', value: '2026-11-13T08:00:00.000Z' },
            { field: '@requestId', value: 'c6b49674-286d-424f-8074-5e19a69dc7a8' },
            { field: '@message', value: message },
          ],
        ],
      ],
    ]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

// EVO-RBREORG-OPUS-01 F4 (P13): the SEND downstream signature moves from the common
// classifier into SEND_LAMBDA_PROFILE. Every SEND Lambda pipeline keeps classifying it.
describe('SEND Lambda runbooks classify the downstream signature', () => {
  const lambdaRunbooks = SEND_MANIFEST.map((registration) => registration.build()).filter((runbook) =>
    runbook.steps.some((descriptor) => descriptor.step.id === 'parse-lambda-errors'),
  );

  it('covers the SEND Lambda pipelines', () => {
    assert.ok(lambdaRunbooks.length >= 12, `found ${lambdaRunbooks.length}`);
  });

  for (const runbook of lambdaRunbooks) {
    it(`${runbook.metadata.id}: "External service … returned errors" is a downstream error`, async () => {
      const step = runbook.steps.find((descriptor) => descriptor.step.id === 'parse-lambda-errors')?.step;
      assert.ok(step);
      const result = await step.execute(contextWithErrorRow(DOWNSTREAM_MESSAGE));
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.vars?.['lambdaErrorCategory'], 'downstream');
    });
  }
});
