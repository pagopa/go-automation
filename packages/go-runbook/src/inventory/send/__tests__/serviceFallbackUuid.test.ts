import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createTestServiceRegistry, service } from '../../../toolkits/send/index.js';
import type { RunbookContext } from '../../../engine/index.js';
import { SEND_MANIFEST } from '../manifest.js';

const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function contextWithRow(queryStepId: string): RunbookContext {
  return {
    executionId: 'service-fallback-uuid-test',
    startedAt: new Date('2026-11-13T08:00:00.000Z'),
    stepResults: new Map([
      [
        queryStepId,
        [
          [
            { field: 'level', value: 'ERROR' },
            { field: 'message', value: `retry FALLBACK-UUID:${UUID} failed` },
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

// EVO-RBREORG-OPUS-01 F4: the FALLBACK-UUID extraction leaves the common scanner and is
// injected by SEND_SERVICE_PROFILE. Every SEND service pipeline keeps extracting it.
describe('SEND service runbooks extract the FALLBACK-UUID', () => {
  const analyzeSteps = SEND_MANIFEST.flatMap((registration) => {
    const runbook = registration.build();
    return runbook.steps
      .filter((descriptor) => descriptor.step instanceof service.AnalyzeApplicationLogsStep)
      .map((descriptor) => ({ runbookId: runbook.metadata.id, step: descriptor.step }));
  });

  it('covers the SEND service and downstream pipelines', () => {
    assert.ok(analyzeSteps.length >= 14, `found ${analyzeSteps.length}`);
  });

  for (const { runbookId, step } of analyzeSteps) {
    it(`${runbookId}: ${step.id}`, async () => {
      const result = await step.execute(contextWithRow(step.id.replace(/^analyze-/u, 'query-')));
      assert.strictEqual(result.success, true);
      const fallbackVars = Object.entries(result.vars ?? {}).filter(([name]) => name.endsWith('FallbackUuid'));
      assert.deepStrictEqual(
        fallbackVars.map(([, value]) => value),
        [UUID],
      );
    });
  }
});
