import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { logAction, type Runbook, type Step } from '@go-automation/go-runbook';

import { validateCloudRunbookRegistry } from '../runbookRegistry.js';

const noopStep: Step<void> = {
  id: 'read-only',
  label: 'Read only',
  kind: 'data',
  async execute() {
    await Promise.resolve();
    return { success: true };
  },
};

function runbook(policy: boolean): Runbook {
  return {
    metadata: {
      id: 'test',
      name: 'test',
      description: 'test',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    steps: [{ step: noopStep }],
    knownCases: [],
    fallbackAction: logAction({ level: 'info', message: 'done' }),
    ...(policy ? { cloudExecutionPolicy: { sideEffects: 'NONE' as const } } : {}),
  };
}

describe('validateCloudRunbookRegistry', () => {
  it('accepts every registered production runbook', () => {
    assert.doesNotThrow(() => validateCloudRunbookRegistry());
  });

  it('rejects a runbook without an explicit cloud policy', () => {
    assert.throws(
      () => validateCloudRunbookRegistry(new Map([['alarm', () => runbook(false)]])),
      /does not declare cloud sideEffects=NONE/,
    );
  });
});
