import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../services/createTestServiceRegistry.js';
import { CollectingRunbookReporter } from '../../../services/reporters/CollectingRunbookReporter.js';
import { PrepareApiGwSectionStep } from '../PrepareApiGwSectionStep.js';

function createContext(reporter: CollectingRunbookReporter): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(),
    vars: new Map<string, string>(),
    params: new Map<string, string>(),
    logs: [],
    services: createTestServiceRegistry({ reporter }),
    recoveredErrors: [],
  };
}

describe('PrepareApiGwSectionStep', () => {
  it('opens exactly one section on the reporter', async () => {
    const reporter = new CollectingRunbookReporter();
    const step = new PrepareApiGwSectionStep({
      id: 'prepare-api-gw-section',
      label: 'Preparazione API Gateway',
      apiGwLogGroup: '/aws/apigateway/pn-delivery-B2B',
    });

    const result = await step.execute(createContext(reporter));

    assert.strictEqual(result.success, true);
    assert.strictEqual(reporter.sections.length, 1);
  });

  it('reports the configured log group as a node under the section', async () => {
    const reporter = new CollectingRunbookReporter();
    const step = new PrepareApiGwSectionStep({
      id: 'prepare-api-gw-section',
      label: 'Preparazione API Gateway',
      apiGwLogGroup: '/aws/apigateway/pn-delivery-B2B',
    });

    await step.execute(createContext(reporter));

    assert.strictEqual(reporter.sections[0], 'Preparazione: query API Gateway');
    assert.deepStrictEqual(reporter.nodes, [{ label: 'Log group: /aws/apigateway/pn-delivery-B2B' }]);
  });

  it('is a banner only: it produces no output and writes no vars', async () => {
    const reporter = new CollectingRunbookReporter();
    const step = new PrepareApiGwSectionStep({ id: 'prepare', label: 'Prepare', apiGwLogGroup: '/aws/x' });

    const result = await step.execute(createContext(reporter));

    assert.strictEqual(result.output, undefined);
    assert.strictEqual(result.vars, undefined);
  });
});
