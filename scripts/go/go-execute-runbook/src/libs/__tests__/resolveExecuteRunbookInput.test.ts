import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { WatchtowerClient } from '@go-automation/go-watchtower-client';
import { createTestServiceRegistry } from '@pagopa/go-runbook/toolkits/common';
import { RUNBOOK_CATALOG } from '@pagopa/go-runbook/inventory';
import { GOLogger } from '@pagopa/go-common/logging';

import type { ExecuteRunbookDeps } from '../../types/ExecuteRunbookDeps.js';
import { assertRunbookCapability } from '../assertRunbookCapability.js';
import { resolveExecuteRunbookInput } from '../resolveExecuteRunbookInput.js';

const ALARM_NAME = 'pn-ioAuthorizerLambda-LogInvocationErrors-Alarm';

function depsFor(alarmName: string): ExecuteRunbookDeps {
  const watchtower = {
    getAlarmEvent: async () => {
      await Promise.resolve();
      return {
        id: '0192c000-0000-7000-8000-0000000000aa',
        alarmId: '0192c000-0000-7000-8000-0000000000dd',
        name: alarmName,
        firedAt: '2026-11-13T08:00:00.000Z',
        awsAccountId: '510769970275',
        awsRegion: 'eu-south-1',
        product: { id: '0192c000-0000-7000-8000-0000000000bb' },
        environment: { id: '0192c000-0000-7000-8000-0000000000cc' },
      };
    },
  };
  return {
    // Safe: resolveExecuteRunbookInput only calls getAlarmEvent.
    watchtower: watchtower as unknown as WatchtowerClient,
    logger: new GOLogger(),
    services: createTestServiceRegistry(),
    awsProfiles: [],
    useConfiguredAwsProfiles: false,
    workerArtifactRevision: 'local',
  };
}

// EVO-RBREORG-OPUS-01 §7.5 (RBREORG-22): the catalog is lazy, and these run before any
// listDescriptors() call in this process, i.e. on a cold catalog.
describe('resolveExecuteRunbookInput on a cold catalog', () => {
  it('resolves a complete descriptor that the capability check accepts and that matches the listed one', async () => {
    const input = await resolveExecuteRunbookInput(depsFor(ALARM_NAME), {
      alarmEventId: '0192c000-0000-7000-8000-0000000000aa',
      executionId: '0192c000-0000-7000-8000-000000000001',
      watchtowerUrl: 'https://watchtower.invalid',
      watchtowerServiceId: 'test',
    });

    assert.match(input.runbook.definitionDigest, /^sha256-[0-9a-f]{64}$/u);
    assert.doesNotThrow(() => assertRunbookCapability(input));
    assert.throws(
      () =>
        assertRunbookCapability({
          ...input,
          runbook: { ...input.runbook, definitionDigest: `sha256-${'0'.repeat(64)}` },
        }),
      /RUNBOOK_CAPABILITY_MISMATCH|requested=/u,
    );

    const listed = RUNBOOK_CATALOG.listDescriptors().find((descriptor) => descriptor.key === input.runbook.key);
    assert.ok(listed);
    assert.strictEqual(input.runbook.definitionDigest, listed.definitionDigest);
    assert.strictEqual(input.runbook.version, listed.version);
  });
});
