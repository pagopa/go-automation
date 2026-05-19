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

  it('keeps fallbackUuid when moving to the target service', async () => {
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
        userAttributesFallbackUuidFresh: 'true',
        xRayTraceId: '1-abc',
        fallbackUuid: 'fb-1',
      }),
    );

    assert.deepStrictEqual(result.next, { goTo: 'query-pn-external-registries' });
    assert.strictEqual(result.vars?.['terminationReason'], '');
  });

  it('retries the same service with only the detected trace_id after a fallback query', async () => {
    const step = decideNext({
      id: 'decide',
      label: 'Decide',
      serviceName: 'pn-data-vault',
      varPrefix: 'dataVault',
      servicesInRunbook: services,
    });

    const result = await step.execute(
      createContext({
        dataVaultFreshTraceId: '1-3d472be7-2977635208a92722b97b5e24',
        dataVaultFreshTraceIdRaw: '3d472be72977635208a92722b97b5e24',
        xRayTraceId: '1-abc',
        fallbackUuid: 'fb-1',
      }),
    );

    assert.deepStrictEqual(result.next, { goTo: 'query-pn-data-vault' });
    assert.strictEqual(result.output?.decision.kind, 'trace-id-swap');
    assert.strictEqual(result.vars?.['xRayTraceId'], '1-3d472be7-2977635208a92722b97b5e24');
    assert.strictEqual(result.vars?.['fallbackUuid'], '');
    assert.strictEqual(result.vars?.['dataVaultSwappedTraceIdRaw'], '3d472be72977635208a92722b97b5e24');
    assert.strictEqual(result.vars?.['apiGwTraceIdSwapCount'], '1');
    assert.strictEqual(result.vars?.['apiGwOriginalTraceId'], '1-abc');
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

  it('stops with loop-detected when the target is the current service', async () => {
    const step = decideNext({
      id: 'decide',
      label: 'Decide',
      serviceName: 'pn-data-vault',
      varPrefix: 'dataVault',
      servicesInRunbook: services,
    });

    const result = await step.execute(
      createContext({
        dataVaultNextUrlTarget: 'pn-data-vault',
        dataVaultNextUrl: 'https://api.pdv.pagopa.it/user-registry/v1/users/abc',
        dataVaultErrorMsg: 'self target detected',
        xRayTraceId: '1-abc',
        fallbackUuid: 'fb-1',
      }),
    );

    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.output?.decision.kind, 'stop');
    assert.strictEqual(result.vars?.['terminationReason'], 'loop-detected');
    assert.strictEqual(result.vars?.['lastErrorMsg'], 'self target detected');
  });

  it('does not retry the same service for fallback UUID alone', async () => {
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

    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['terminationReason'], 'no-match');
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

  it('stops when trace_id swap would exceed the safety limit', async () => {
    const step = decideNext({
      id: 'decide',
      label: 'Decide',
      serviceName: 'pn-data-vault',
      varPrefix: 'dataVault',
      servicesInRunbook: services,
    });

    const result = await step.execute(
      createContext({
        dataVaultFreshTraceId: '1-3d472be7-2977635208a92722b97b5e24',
        xRayTraceId: '1-abc',
        fallbackUuid: 'fb-1',
        apiGwTraceIdSwapCount: '5',
      }),
    );

    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['terminationReason'], 'loop-detected');
  });
});
