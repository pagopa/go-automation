import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../../services/ServiceRegistry.js';

import { stopApiGwExecutionLogAnalysis } from '../StopApiGwExecutionLogAnalysisStep.js';

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

describe('stopApiGwExecutionLogAnalysis', () => {
  it('does not stop the runbook when execution logs were not queried', async () => {
    const step = stopApiGwExecutionLogAnalysis({
      id: 'stop-execution-log-analysis',
      label: 'Stop execution log analysis',
    });

    const result = await step.execute(createContext({ apiGwExecutionLogMode: 'no-request-id' }));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, undefined);
    assert.strictEqual(result.vars, undefined);
  });

  it('stops with execution-log termination vars when execution logs were queried', async () => {
    const step = stopApiGwExecutionLogAnalysis({
      id: 'stop-execution-log-analysis',
      label: 'Stop execution log analysis',
    });

    const result = await step.execute(
      createContext({
        apiGwExecutionLogMode: 'queried',
        lastErrorMsg: 'Execution log analysis unresolved',
      }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, 'stop');
    assert.strictEqual(result.vars?.['terminationReason'], 'api-gw-execution-log-unresolved');
    assert.strictEqual(result.vars?.['lastErrorMsg'], 'Execution log analysis unresolved');
  });
});
