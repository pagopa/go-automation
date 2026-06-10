import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';
import { PrepareServiceSectionStep } from '../prepareServiceSection.js';

function ctx(): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-06-09T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(),
    vars: new Map<string, string>(),
    params: new Map<string, string>(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

describe('PrepareServiceSectionStep', () => {
  it('exposes id, label and the control kind', () => {
    const step = new PrepareServiceSectionStep({
      id: 'prepare-service-section',
      label: 'Preparazione servizio',
      serviceName: 'pn-foo',
      logGroup: '/aws/ecs/pn-foo',
    });

    assert.strictEqual(step.id, 'prepare-service-section');
    assert.strictEqual(step.label, 'Preparazione servizio');
    assert.strictEqual(step.kind, 'control');
  });

  it('completes without polluting the shared var scope', async () => {
    const step = new PrepareServiceSectionStep({
      id: 'prepare-service-section',
      label: 'Preparazione servizio',
      serviceName: 'pn-foo',
      logGroup: '/aws/ecs/pn-foo',
    });

    const result = await step.execute(ctx());

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars, undefined);
  });
});
