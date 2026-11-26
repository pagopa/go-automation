import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SetVarStep } from '../../../../engine/steps/control/SetVarStep.js';
import { logAction } from '../../../../engine/actions/ActionFactories.js';
import { startAlarmRunbook } from '../startAlarmRunbook.js';
import type { Runbook } from '../../../../engine/types/Runbook.js';
import type { OccurrenceTimeWindow } from '../../time/occurrence/OccurrenceTimeWindow.js';
import { TEST_RUNBOOK_METADATA } from '../../../../__tests__/helpers/TEST_RUNBOOK_METADATA.js';

function build(occurrenceTimeWindow?: OccurrenceTimeWindow): Runbook {
  return startAlarmRunbook({
    id: 'probe',
    metadata: TEST_RUNBOOK_METADATA,
    ...(occurrenceTimeWindow === undefined ? {} : { occurrenceTimeWindow }),
  })
    .step(new SetVarStep({ id: 'set', label: 'set', varName: 'x', value: '1' }))
    .fallback(logAction({ level: 'info', title: 'fallback' }))
    .build();
}

describe('startAlarmRunbook', () => {
  it('opens a read-only runbook with the id and metadata of the config', () => {
    const runbook = build();
    assert.strictEqual(runbook.metadata.id, 'probe');
    assert.strictEqual(runbook.metadata.name, TEST_RUNBOOK_METADATA.name);
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.strictEqual(runbook.occurrenceTimeWindow, undefined);
  });

  it('sets the occurrence window only when the config declares it', () => {
    assert.deepStrictEqual(build({ beforeMinutes: 5, afterMinutes: 1 }).occurrenceTimeWindow, {
      beforeMinutes: 5,
      afterMinutes: 1,
    });
  });
});
