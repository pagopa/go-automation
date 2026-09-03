import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Core } from '@go-automation/go-common';
import { createTestServiceRegistry } from '@go-automation/go-runbook';
import type { WatchtowerClient } from '@go-automation/go-watchtower-client';
import { AUTOMATIC_RUNBOOK_REGISTRY } from '@go-automation/go-runbook/catalog';

import type { ExecuteRunbookCliConfig } from '../../types/ExecuteRunbookConfig.js';
import type { ExecuteRunbookDeps } from '../../types/ExecuteRunbookDeps.js';
import { assertRunbookCapability } from '../assertRunbookCapability.js';
import { resolveExecuteRunbookInput } from '../resolveExecuteRunbookInput.js';

const INTEROP_RUNBOOK = AUTOMATIC_RUNBOOK_REGISTRY.resolveByKey(
  'k8s-interop-be-backend-for-frontend-errors',
)!.descriptor;

describe('go-execute-runbook INTEROP alarm aliases', () => {
  it('resolves a concrete environment alarm to the canonical runbook key and preserves alarmName', async () => {
    const deps = fakeDeps('k8s-interop-be-backend-for-frontend-errors-att');
    const input = await resolveExecuteRunbookInput(deps, config());

    assert.strictEqual(input.runbook.key, 'k8s-interop-be-backend-for-frontend-errors');
    assert.strictEqual(input.alarmEvent.alarmName, 'k8s-interop-be-backend-for-frontend-errors-att');
    assert.strictEqual(input.runbook.definitionDigest, INTEROP_RUNBOOK.definitionDigest);
    assert.doesNotThrow(() => assertRunbookCapability(input, 'worker-interop'));
  });

  it('rejects a pinned canonical runbook when the concrete alarm is not declared as an alias', async () => {
    const deps = fakeDeps('k8s-interop-be-backend-for-frontend-errors-prod');
    const input = await resolveExecuteRunbookInput(deps, config());

    assert.throws(
      () =>
        assertRunbookCapability(
          {
            ...input,
            alarmEvent: {
              ...input.alarmEvent,
              alarmName: 'k8s-interop-be-backend-for-frontend-errors-dev',
            },
          },
          'worker-interop',
        ),
      /Runbook capability mismatch/u,
    );
  });
});

function config(): ExecuteRunbookCliConfig {
  return {
    alarmEventId: '0192c000-0000-7000-8000-0000000000aa',
    executionId: '0192c000-0000-7000-8000-000000000001',
    watchtowerUrl: 'http://localhost:3001',
    watchtowerServiceId: 'runbook-worker',
  };
}

function fakeDeps(alarmName: string): ExecuteRunbookDeps {
  return {
    watchtower: {
      async getAlarmEvent(alarmEventId: string): Promise<unknown> {
        await Promise.resolve();
        return {
          id: alarmEventId,
          product: { id: '0192c000-0000-7000-8000-0000000000bb' },
          environment: { id: '0192c000-0000-7000-8000-0000000000cc' },
          alarmId: '0192c000-0000-7000-8000-0000000000dd',
          name: alarmName,
          firedAt: '2026-07-09T10:00:00.000Z',
          awsAccountId: '170533023216',
          awsRegion: 'eu-south-1',
        };
      },
    } as unknown as WatchtowerClient,
    logger: new Core.GOLogger(),
    services: createTestServiceRegistry(),
    awsProfiles: [],
    useConfiguredAwsProfiles: false,
    workerArtifactRevision: 'worker-interop',
  };
}
