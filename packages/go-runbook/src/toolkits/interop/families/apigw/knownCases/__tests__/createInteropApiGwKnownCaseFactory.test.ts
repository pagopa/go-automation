import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createInteropApiGwKnownCaseFactory } from '../createInteropApiGwKnownCaseFactory.js';

const knownCase = createInteropApiGwKnownCaseFactory({
  apiGatewayStepId: 'query-api-gw-logs',
  applicationLogsStepId: 'query-app',
  cidTrackerStepId: 'query-tracker',
  varPrefix: 'app',
  applicationLogsLabel: 'Log app',
});

const BASE = {
  id: 'case',
  description: 'Caso',
  regex: 'boom',
  resolution: 'PIN-1',
  proposedStatus: 'IN_PROGRESS',
} as const;

describe('createInteropApiGwKnownCaseFactory', () => {
  it('builds a case on the evidence of the runbook, with the rows of the API Gateway family', () => {
    const built = knownCase({ ...BASE, resources: ['waf'] });
    assert.strictEqual(built.condition.type, 'or');
    assert.deepStrictEqual(built.action, {
      type: 'log',
      level: 'info',
      renderAs: 'known-case',
      title: 'Caso',
      details: [
        ['Risoluzione', 'PIN-1'],
        ['Ambiente', '{{vars.interopEnvironment}}'],
        ['API Gateway ID', '{{vars.interopApiGwId}}'],
        ['Servizio', '{{vars.interopPodApp}}'],
        ['Log app', '{{vars.appLogCount}}'],
        ['CID analizzati', '{{vars.appCidCount}}'],
      ],
    });
    assert.deepStrictEqual(built.analysis, {
      resolution: 'PIN-1',
      proposedStatus: 'IN_PROGRESS',
      analysisType: 'ANALYZABLE',
      resources: [{ name: 'waf', role: 'CASE_RELATED' }],
    });
  });

  it('reads one step when asked, in the declared environments, with the guard', () => {
    const guard = { type: 'exists', ref: 'vars.x' } as const;
    assert.deepStrictEqual(
      knownCase({ ...BASE, evidence: 'APPLICATION_LOGS', environments: ['prod'], guard }).condition,
      {
        type: 'and',
        conditions: [
          { type: 'contains', ref: 'vars.interopEnvironment', value: ['prod'] },
          { type: 'and', conditions: [{ type: 'contains', ref: 'steps.query-app', regex: 'boom' }, guard] },
        ],
      },
    );
    assert.deepStrictEqual(knownCase({ ...BASE, evidence: 'API_GATEWAY' }).condition, {
      type: 'contains',
      ref: 'steps.query-api-gw-logs',
      regex: 'boom',
    });
  });
});
