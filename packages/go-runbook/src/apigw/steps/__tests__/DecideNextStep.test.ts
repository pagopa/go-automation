import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import { decideNext } from '../DecideNextStep.js';

function createContext(vars: Record<string, string> = {}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(Object.entries(vars)),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

const services = new Set(['pn-user-attributes', 'pn-data-vault', 'pn-external-registries']);

describe('decideNext', () => {
  it('emits goTo on the target service when the URL is internal', async () => {
    const step = decideNext({
      id: 'decide',
      label: 'Decide',
      serviceName: 'pn-user-attributes',
      varPrefix: 'userAttributes',
      servicesInRunbook: services,
    });

    const result = await step.execute(
      createContext({
        userAttributesNextUrlTarget: 'pn-external-registries',
        userAttributesNextUrl: 'http://internal/...',
        xRayTraceId: '1-abc',
      }),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.next, { goTo: 'query-pn-external-registries' });
    assert.strictEqual(result.output?.decision.kind, 'goto-service');
  });

  it('stops with external-downstream when the target is outside the runbook', async () => {
    const step = decideNext({
      id: 'decide',
      label: 'Decide',
      serviceName: 'pn-external-registries',
      varPrefix: 'externalRegistries',
      servicesInRunbook: services,
    });

    const result = await step.execute(
      createContext({
        externalRegistriesNextUrlTarget: 'AppIO',
        externalRegistriesNextUrl: 'https://api.io.pagopa.it/api/v1/activations/x',
        externalRegistriesErrorMsg: 'Service IO returned errors=404',
        xRayTraceId: '1-abc',
      }),
    );

    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['terminationReason'], 'external-downstream');
    assert.strictEqual(result.vars?.['downstreamTarget'], 'AppIO');
  });

  it('retries the same service on a fresh fallback UUID', async () => {
    const step = decideNext({
      id: 'decide',
      label: 'Decide',
      serviceName: 'pn-data-vault',
      varPrefix: 'dataVault',
      servicesInRunbook: services,
    });

    const result = await step.execute(
      createContext({
        dataVaultNextUrlTarget: '',
        dataVaultFallbackUuidFresh: 'true',
        xRayTraceId: '1-abc',
        fallbackUuid: 'fb-1',
      }),
    );

    assert.deepStrictEqual(result.next, { goTo: 'query-pn-data-vault' });
    assert.strictEqual(result.vars?.['dataVaultFallbackUuidFresh'], 'false');
  });

  it('stops with no-match when there is nothing left to follow', async () => {
    const step = decideNext({
      id: 'decide',
      label: 'Decide',
      serviceName: 'pn-user-attributes',
      varPrefix: 'userAttributes',
      servicesInRunbook: services,
    });

    const result = await step.execute(createContext({ xRayTraceId: '1-abc' }));

    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['terminationReason'], 'no-match');
  });

  it('detects a loop when the next destination key was already visited', async () => {
    const step = decideNext({
      id: 'decide',
      label: 'Decide',
      serviceName: 'pn-user-attributes',
      varPrefix: 'userAttributes',
      servicesInRunbook: services,
    });

    // Pre-populate visitedKeys with the destination key.
    const visited = ['pn-external-registries|1-abc|', 'pn-user-attributes|1-abc|'].join('\n');

    const result = await step.execute(
      createContext({
        userAttributesNextUrlTarget: 'pn-external-registries',
        userAttributesNextUrl: 'http://internal',
        xRayTraceId: '1-abc',
        apiGwVisitedKeys: visited,
      }),
    );

    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['terminationReason'], 'loop-detected');
  });
});
