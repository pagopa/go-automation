import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SEND_MANIFEST } from '../manifest.js';
import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../__tests__/helpers/logRow.js';

const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// The FALLBACK-UUID extraction is injected by SEND_SERVICE_PROFILE, not by the
// common scanner: every SEND service pipeline must keep extracting it.
describe('SEND service runbooks extract the FALLBACK-UUID', () => {
  it('extracts the FALLBACK-UUID of every error in every SEND service and downstream pipeline', () => {
    const roots = SEND_MANIFEST.flatMap((registration) => {
      const runbook = registration.build();
      const root = runbook.tree?.root;
      const stepId = root?.scopedSteps?.[0];
      return root === undefined || stepId === undefined || runbook.runbookContext?.kind !== 'service'
        ? []
        : [{ runbookId: runbook.metadata.id, root, stepId }];
    });
    assert.ok(roots.length >= 14, `found ${roots.length}`);

    for (const { runbookId, root, stepId } of roots) {
      const { nodes } = root.enumerate({
        context: createTestContext({
          stepResults: { [stepId]: [logRow({ level: 'ERROR', message: `retry FALLBACK-UUID:${UUID} failed` })] },
        }),
        rows: [],
      });
      assert.deepStrictEqual(
        Object.entries(nodes[0]?.vars ?? {})
          .filter(([name]) => name.endsWith('FallbackUuid'))
          .map(([, value]) => value),
        [UUID],
        runbookId,
      );
    }
  });
});
