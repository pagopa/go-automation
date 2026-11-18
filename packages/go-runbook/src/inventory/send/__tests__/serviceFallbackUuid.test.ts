import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { service } from '../../../toolkits/send/index.js';
import { SEND_MANIFEST } from '../manifest.js';
import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../__tests__/helpers/logRow.js';

const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// The FALLBACK-UUID extraction is injected by SEND_SERVICE_PROFILE, not by the
// common scanner: every SEND service pipeline must keep extracting it.
describe('SEND service runbooks extract the FALLBACK-UUID', () => {
  it('extracts the FALLBACK-UUID in every SEND service and downstream pipeline', async () => {
    const analyzeSteps = SEND_MANIFEST.flatMap((registration) => {
      const runbook = registration.build();
      return runbook.steps
        .filter(({ step }) => step instanceof service.AnalyzeApplicationLogsStep)
        .map(({ step }) => ({ runbookId: runbook.metadata.id, step }));
    });
    assert.ok(analyzeSteps.length >= 14, `found ${analyzeSteps.length}`);

    for (const { runbookId, step } of analyzeSteps) {
      const queryStepId = step.id.replace(/^analyze-/u, 'query-');
      const result = await step.execute(
        createTestContext({
          stepResults: { [queryStepId]: [logRow({ level: 'ERROR', message: `retry FALLBACK-UUID:${UUID} failed` })] },
        }),
      );
      assert.strictEqual(result.success, true, `${runbookId}: ${step.id}`);
      assert.deepStrictEqual(
        Object.entries(result.vars ?? {})
          .filter(([name]) => name.endsWith('FallbackUuid'))
          .map(([, value]) => value),
        [UUID],
        `${runbookId}: ${step.id}`,
      );
    }
  });
});
