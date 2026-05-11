import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import { KnownUrlsRegistry } from '../../registries/KnownUrlsRegistry.js';
import { resolveKnownUrl } from '../ResolveKnownUrlStep.js';

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

describe('resolveKnownUrl', () => {
  const registry = new KnownUrlsRegistry([
    {
      kind: 'external',
      url: 'https://api.io.pagopa.it/api/v1/activations/',
      downstream: 'AppIO',
    },
    {
      kind: 'internal',
      url: 'http://internal-EcsA-123:8080/ext-registry-private/',
      service: 'pn-external-registries',
    },
    {
      kind: 'internal',
      url: 'http://internal-EcsA-999:8080/missing/',
      service: 'pn-missing-service',
    },
  ]);

  const servicesInRunbook: ReadonlySet<string> = new Set([
    'pn-user-attributes',
    'pn-data-vault',
    'pn-external-registries',
  ]);

  it('returns kind=none when NextUrl is missing or empty', async () => {
    const step = resolveKnownUrl({
      id: 'resolve',
      label: 'Resolve URL',
      varPrefix: 'svc',
      registry,
      servicesInRunbook,
    });

    const result = await step.execute(createContext({}));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['svcUrlKind'], 'none');
    assert.strictEqual(result.vars?.['svcUrlTarget'], '');
    assert.strictEqual(result.vars?.['svcUrlNeedsRoutingFix'], 'false');
  });

  it('returns kind=unknown when URL is not in the registry', async () => {
    const step = resolveKnownUrl({
      id: 'resolve',
      label: 'Resolve URL',
      varPrefix: 'svc',
      registry,
      servicesInRunbook,
    });

    const result = await step.execute(createContext({ svcNextUrl: 'https://unknown.example.com/path' }));

    assert.strictEqual(result.vars?.['svcUrlKind'], 'unknown');
    assert.strictEqual(result.vars?.['svcUrlTarget'], '');
    assert.strictEqual(result.vars?.['svcUrlNeedsRoutingFix'], 'false');
  });

  it('returns kind=external with downstream name', async () => {
    const step = resolveKnownUrl({
      id: 'resolve',
      label: 'Resolve URL',
      varPrefix: 'svc',
      registry,
      servicesInRunbook,
    });

    const result = await step.execute(createContext({ svcNextUrl: 'https://api.io.pagopa.it/api/v1/activations/abc' }));

    assert.strictEqual(result.vars?.['svcUrlKind'], 'external');
    assert.strictEqual(result.vars?.['svcUrlTarget'], 'AppIO');
    assert.strictEqual(result.vars?.['svcUrlNeedsRoutingFix'], 'false');
  });

  it('returns kind=internal with service name when service is in runbook', async () => {
    const step = resolveKnownUrl({
      id: 'resolve',
      label: 'Resolve URL',
      varPrefix: 'svc',
      registry,
      servicesInRunbook,
    });

    const result = await step.execute(
      createContext({ svcNextUrl: 'http://internal-EcsA-123:8080/ext-registry-private/io/v1/activations' }),
    );

    assert.strictEqual(result.vars?.['svcUrlKind'], 'internal');
    assert.strictEqual(result.vars?.['svcUrlTarget'], 'pn-external-registries');
    assert.strictEqual(result.vars?.['svcUrlNeedsRoutingFix'], 'false');
  });

  it('returns UrlNeedsRoutingFix=true when internal service is missing from runbook', async () => {
    const step = resolveKnownUrl({
      id: 'resolve',
      label: 'Resolve URL',
      varPrefix: 'svc',
      registry,
      servicesInRunbook,
    });

    const result = await step.execute(createContext({ svcNextUrl: 'http://internal-EcsA-999:8080/missing/something' }));

    assert.strictEqual(result.vars?.['svcUrlKind'], 'internal');
    assert.strictEqual(result.vars?.['svcUrlTarget'], 'pn-missing-service');
    assert.strictEqual(result.vars?.['svcUrlNeedsRoutingFix'], 'true');
  });
});
