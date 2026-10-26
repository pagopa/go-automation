import { AUTH_SERVER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KNOWN_CASES } from '../knownCases.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator, type KnownCase, type RunbookContext } from '../../framework.js';

interface Fixture {
  readonly message: string;
  readonly environment?: 'prod' | 'att' | 'test';
  readonly source?: 'APPLICATION' | 'API_GATEWAY';
}

const FIXTURES: ReadonlyMap<string, Fixture> = new Map([
  [
    'auth-server-client-assertion-expired',
    {
      message:
        'Client assertion signature validation failed for client client-123 - Token expired in client assertion signature validation',
    },
  ],
  ['auth-server-invalid-client-id-uuid', { message: 'Validation error: Invalid uuid at "client_id"' }],
  ['auth-server-required-client-assertion-type', { message: 'Validation error: Required at "client_assertion_type"' }],
  ['auth-server-invalid-purpose-id-uuid', { message: 'Purpose Id claim invalid-purpose is not a valid UUID' }],
  [
    'auth-server-client-assertion-not-before',
    {
      message:
        'Client assertion signature validation failed for client client-123 - Current time is before not before time in client assertion signature validation',
    },
  ],
  [
    'auth-server-platform-state-agreement-or-purpose-inactive',
    { message: 'errors: 007-0008, Platform state validation failed - Agreement state is: INACTIVE' },
  ],
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
    {
      message:
        'Client assertion signature validation failed for client client-123 - Client assertion signature is invalid',
    },
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

  it('keeps every case open until correlation, impact and subsequent requests have been checked', () => {
    assert.ok(KNOWN_CASES.every(({ analysis }) => analysis?.proposedStatus === 'IN_PROGRESS'));
    const forbidden = knownCaseById('auth-server-api-gateway-forbidden-403');
    assert.ok(
      KNOWN_CASES.filter(({ id }) => id !== forbidden.id).every(({ priority }) => priority > forbidden.priority),
    );
  });

  it('distinguishes not-before validation from an invalid cryptographic signature', () => {
    const message = FIXTURES.get('auth-server-client-assertion-not-before')?.message ?? '';
    assert.strictEqual(
      evaluator.evaluate(knownCaseById('auth-server-client-assertion-not-before').condition, context({ message })),
      true,
    );
    assert.strictEqual(
      evaluator.evaluate(
        knownCaseById('auth-server-client-assertion-signature-validation-failed').condition,
        context({ message }),
      ),
      false,
    );
  });

  it('distinguishes expired assertions from invalid signatures and not-before failures', () => {
    const message = FIXTURES.get('auth-server-client-assertion-expired')?.message ?? '';
    assert.strictEqual(
      evaluator.evaluate(knownCaseById('auth-server-client-assertion-expired').condition, context({ message })),
      true,
    );
    for (const id of [
      'auth-server-client-assertion-not-before',
      'auth-server-client-assertion-signature-validation-failed',
    ]) {
      assert.strictEqual(evaluator.evaluate(knownCaseById(id).condition, context({ message })), false);
    }
  });

  it('matches validation fields through JSON escaping without matching different field names', () => {
    for (const [id, field, detail] of [
      ['auth-server-invalid-client-id-uuid', 'client_id', 'Invalid uuid'],
      ['auth-server-required-client-assertion-type', 'client_assertion_type', 'Required'],
    ]) {
      assert.ok(id && field && detail);
      const knownCase = knownCaseById(id);
      for (const encode of [false, true]) {
        const message: string = `Validation error: ${detail} at "${field}"`;
        assert.strictEqual(
          evaluator.evaluate(
            knownCase.condition,
            context({ message: encode ? JSON.stringify({ log: message }) : message }),
          ),
          true,
        );
      }
      for (const message of [
        `Validation error: ${detail} at "${field}_backup"`,
        `Validation error: ${detail} at "other_field", ${field} is present`,
      ]) {
        assert.strictEqual(evaluator.evaluate(knownCase.condition, context({ message })), false);
      }
    }
  });

  it('recognizes either inactive state without requiring both to be inactive', () => {
    const knownCase = knownCaseById('auth-server-platform-state-agreement-or-purpose-inactive');
    for (const entity of ['Agreement', 'Purpose']) {
      assert.strictEqual(
        evaluator.evaluate(
          knownCase.condition,
          context({ message: `Platform state validation failed - ${entity} state is: INACTIVE` }),
        ),
        true,
      );
      assert.strictEqual(
        evaluator.evaluate(
          knownCase.condition,
          context({ message: `Platform state validation failed - ${entity} state is: ACTIVE` }),
        ),
        false,
      );
    }
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
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function knownCaseById(id: string): KnownCase {
  const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined);
  return knownCase;
}
