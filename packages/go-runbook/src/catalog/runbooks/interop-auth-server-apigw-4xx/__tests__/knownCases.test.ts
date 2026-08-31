import { AUTH_SERVER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConditionEvaluator, type KnownCase, type RunbookContext, type ServiceRegistry } from '../../framework.js';

import { KNOWN_CASES } from '../knownCases.js';

interface Fixture {
  readonly message: string;
  readonly environment?: 'prod' | 'att' | 'test';
  readonly source?: 'APPLICATION' | 'API_GATEWAY';
}

const FIXTURES: ReadonlyMap<string, Fixture> = new Map([
  [
    'auth-server-test-rate-limit-known-organization',
    {
      message:
        'Rate limit triggered for organization 738b2cc0-401b-4226-89ea-f49c9441d40f: ' +
        'maximum of 10 requests in 1000ms exceeded.',
      environment: 'test',
    },
  ],
  [
    'auth-server-unexpected-client-assertion-audience',
    {
      message:
        'Client assertion validation failed for clientId: client-123 - ' +
        'Unexpected client assertion audience: auth.uat.interop.pagopa.it/client-assertion',
    },
  ],
  [
    'auth-server-organization-request-limit-exceeded',
    { message: 'Too Many Requests - detail: Requests limit exceeded for organization organization-123' },
  ],
  [
    'auth-server-token-generation-state-entry-not-found',
    { message: 'Entry with PK KID-123 not found in token-generation-states table' },
  ],
  [
    'auth-server-client-assertion-signature-validation-failed',
    { message: 'Client assertion signature validation failed for client client-123' },
  ],
  [
    'auth-server-unexpected-kid-format',
    {
      message:
        'Client assertion validation failed for clientId: 28a14b06-a11c-4155-9827-60db9ea5a148 - ' +
        'Unexpected format for kid',
    },
  ],
  [
    'auth-server-platform-state-inactive',
    {
      message:
        'errors: 007-0008, Platform state validation failed - Agreement state is: INACTIVE, ' +
        'Purpose state is: INACTIVE',
    },
  ],
  [
    'auth-server-api-gateway-forbidden-403',
    { message: 'API Gateway 403 GET /token.oauth2 sourceIp=203.0.113.10', source: 'API_GATEWAY' },
  ],
]);

describe('INTEROP auth-server API Gateway known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('has a unique fixture, id and priority for every documented causal case', () => {
    assert.strictEqual(FIXTURES.size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map(({ id }) => id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map(({ priority }) => priority)).size, KNOWN_CASES.length);
  });

  it('keeps every actionable case above the completed API Gateway 403 case', () => {
    const actionable = KNOWN_CASES.filter(({ analysis }) => analysis?.proposedStatus === 'IN_PROGRESS');
    const completed = KNOWN_CASES.filter(({ analysis }) => analysis?.proposedStatus === 'COMPLETED');
    assert.ok(
      Math.min(...actionable.map(({ priority }) => priority)) > Math.max(...completed.map(({ priority }) => priority)),
    );
  });

  it('matches every case against its documented evidence', () => {
    for (const knownCase of KNOWN_CASES) {
      const fixture = FIXTURES.get(knownCase.id);
      assert.ok(fixture !== undefined, `missing fixture for ${knownCase.id}`);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, context(fixture)), true, knownCase.id);
    }
  });

  it('restricts the organization-specific rate-limit case to test', () => {
    const knownCase = knownCaseById('auth-server-test-rate-limit-known-organization');
    const fixture = FIXTURES.get(knownCase.id);
    assert.ok(fixture !== undefined);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, context({ ...fixture, environment: 'prod' })), false);
  });

  it('matches API Gateway 403 only in access-log evidence', () => {
    const knownCase = knownCaseById('auth-server-api-gateway-forbidden-403');
    const message = FIXTURES.get(knownCase.id)?.message ?? '';
    assert.strictEqual(evaluator.evaluate(knownCase.condition, context({ message, source: 'API_GATEWAY' })), true);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, context({ message, source: 'APPLICATION' })), false);
  });

  it('does not classify the explicitly excluded invalid-claims warning', () => {
    const invalidClaims = context({
      message:
        '[CLIENTID=client] Invalid claims in client assertion payload: ' +
        '[{"code":"unrecognized_keys","keys":["nbf"]}]',
    });
    assert.ok(KNOWN_CASES.every(({ condition }) => !evaluator.evaluate(condition, invalidClaims)));
  });
});

function context(fixture: Fixture): RunbookContext {
  const sourceStep =
    fixture.source === 'API_GATEWAY'
      ? AUTH_SERVER_ALARM.stepIds.queryApiGwAggregates
      : AUTH_SERVER_ALARM.stepIds.queryApplicationLogs;
  return {
    executionId: 'test',
    startedAt: new Date('2026-08-24T10:00:00.000Z'),
    stepResults: new Map([[sourceStep, [[{ field: 'message', value: fixture.message }]]]]),
    vars: new Map([['interopEnvironment', fixture.environment ?? 'prod']]),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function knownCaseById(id: string): KnownCase {
  const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined);
  return knownCase;
}
