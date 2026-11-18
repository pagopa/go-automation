import { AUTH_SERVER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunbookContext } from '../../../../../engine/index.js';
import { conditionContext } from '../../../__tests__/helpers/knownCaseTesting.js';
import { caseMatches, knownCaseById, matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { KNOWN_CASES } from '../knownCases.js';

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
  it('distinguishes not-before validation from an invalid cryptographic signature', () => {
    const message = FIXTURES.get('auth-server-client-assertion-not-before')?.message ?? '';
    assert.strictEqual(caseMatches(byId('auth-server-client-assertion-not-before'), context({ message })), true);
    assert.strictEqual(
      caseMatches(byId('auth-server-client-assertion-signature-validation-failed'), context({ message })),
      false,
    );
  });

  it('distinguishes expired assertions from invalid signatures and not-before failures', () => {
    const message = FIXTURES.get('auth-server-client-assertion-expired')?.message ?? '';
    assert.strictEqual(caseMatches(byId('auth-server-client-assertion-expired'), context({ message })), true);
    for (const id of [
      'auth-server-client-assertion-not-before',
      'auth-server-client-assertion-signature-validation-failed',
    ]) {
      assert.strictEqual(caseMatches(byId(id), context({ message })), false);
    }
  });

  it('matches validation fields through JSON escaping without matching different field names', () => {
    for (const [id, field, detail] of [
      ['auth-server-invalid-client-id-uuid', 'client_id', 'Invalid uuid'],
      ['auth-server-required-client-assertion-type', 'client_assertion_type', 'Required'],
    ]) {
      assert.ok(id && field && detail);
      const knownCase = byId(id);
      for (const encode of [false, true]) {
        const message: string = `Validation error: ${detail} at "${field}"`;
        assert.strictEqual(
          caseMatches(knownCase, context({ message: encode ? JSON.stringify({ log: message }) : message })),
          true,
        );
      }
      for (const message of [
        `Validation error: ${detail} at "${field}_backup"`,
        `Validation error: ${detail} at "other_field", ${field} is present`,
      ]) {
        assert.strictEqual(caseMatches(knownCase, context({ message })), false);
      }
    }
  });

  it('recognizes either inactive state without requiring both to be inactive', () => {
    const knownCase = byId('auth-server-platform-state-agreement-or-purpose-inactive');
    for (const entity of ['Agreement', 'Purpose']) {
      assert.strictEqual(
        caseMatches(knownCase, context({ message: `Platform state validation failed - ${entity} state is: INACTIVE` })),
        true,
      );
      assert.strictEqual(
        caseMatches(knownCase, context({ message: `Platform state validation failed - ${entity} state is: ACTIVE` })),
        false,
      );
    }
  });

  it('matches every case against its documented evidence', () => {
    for (const knownCase of KNOWN_CASES) {
      const fixture = FIXTURES.get(knownCase.id);
      assert.ok(fixture !== undefined, `missing fixture for ${knownCase.id}`);
      assert.strictEqual(caseMatches(knownCase, context(fixture)), true, knownCase.id);
    }
  });

  it('restricts the organization-specific rate-limit case to test', () => {
    const knownCase = byId('auth-server-test-rate-limit-known-organization');
    const fixture = FIXTURES.get(knownCase.id);
    assert.ok(fixture !== undefined);
    assert.strictEqual(caseMatches(knownCase, context({ ...fixture, environment: 'prod' })), false);
  });

  it('matches API Gateway 403 only in access-log evidence', () => {
    const knownCase = byId('auth-server-api-gateway-forbidden-403');
    const message = FIXTURES.get(knownCase.id)?.message ?? '';
    assert.strictEqual(caseMatches(knownCase, context({ message, source: 'API_GATEWAY' })), true);
    assert.strictEqual(caseMatches(knownCase, context({ message, source: 'APPLICATION' })), false);
  });

  it('ranks the API Gateway 403 catch-all below any application diagnosis', () => {
    const forbidden = FIXTURES.get('auth-server-api-gateway-forbidden-403')?.message ?? '';
    const ctx = conditionContext([
      [AUTH_SERVER_ALARM.stepIds.queryApiGwAggregates, [[{ field: 'message', value: forbidden }]]],
      [
        AUTH_SERVER_ALARM.stepIds.queryApplicationLogs,
        [[{ field: 'message', value: 'Validation error: Invalid uuid at "client_id"' }]],
      ],
    ]);
    assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, ctx), [
      'auth-server-invalid-client-id-uuid',
      'auth-server-api-gateway-forbidden-403',
    ]);
  });

  it('does not classify the explicitly excluded invalid-claims warning', () => {
    const invalidClaims = context({
      message:
        '[CLIENTID=client] Invalid claims in client assertion payload: ' +
        '[{"code":"unrecognized_keys","keys":["nbf"]}]',
    });
    assert.ok(matchingCaseIds(KNOWN_CASES, invalidClaims).length === 0);
  });
});

function context(fixture: Fixture): RunbookContext {
  const sourceStep =
    fixture.source === 'API_GATEWAY'
      ? AUTH_SERVER_ALARM.stepIds.queryApiGwAggregates
      : AUTH_SERVER_ALARM.stepIds.queryApplicationLogs;
  return conditionContext([[sourceStep, [[{ field: 'message', value: fixture.message }]]]], fixture.environment);
}

function byId(id: string): ReturnType<typeof knownCaseById> {
  return knownCaseById(KNOWN_CASES, id);
}
