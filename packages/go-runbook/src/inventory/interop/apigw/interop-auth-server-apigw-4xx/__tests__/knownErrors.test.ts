import { AUTH_SERVER_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunbookContext } from '../../../../../engine/index.js';
import { conditionContext } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import {
  caseMatches,
  knownErrorById,
  matchingKnownErrorCodes,
} from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { KNOWN_ERRORS } from '../knownErrors.js';

interface Fixture {
  readonly message: string;
  readonly environment?: 'prod' | 'att' | 'test';
  readonly source?: 'APPLICATION' | 'API_GATEWAY';
}

const FIXTURES: ReadonlyMap<string, Fixture> = new Map([
  [
    'INTEROP_APIGW_IASA4_AUT-SER-CLI-ASS-EXP',
    {
      message:
        'Client assertion signature validation failed for client client-123 - Token expired in client assertion signature validation',
    },
  ],
  ['INTEROP_APIGW_IASA4_AUT-SER-INV-CLI-ID-UUI', { message: 'Validation error: Invalid uuid at "client_id"' }],
  ['INTEROP_APIGW_IASA4_AUT-SER-REQ-CLI-ASS-TYP', { message: 'Validation error: Required at "client_assertion_type"' }],
  ['INTEROP_APIGW_IASA4_AUT-SER-INV-PUR-ID-UUI', { message: 'Purpose Id claim invalid-purpose is not a valid UUID' }],
  [
    'INTEROP_APIGW_IASA4_AUT-SER-CLI-ASS-NOT-BEF',
    {
      message:
        'Client assertion signature validation failed for client client-123 - Current time is before not before time in client assertion signature validation',
    },
  ],
  [
    'INTEROP_APIGW_IASA4_AUT-SER-PLA-STA-AGR-OR-PUR-INA',
    { message: 'errors: 007-0008, Platform state validation failed - Agreement state is: INACTIVE' },
  ],
  [
    'INTEROP_APIGW_IASA4_AUT-SER-TES-RAT-LIM-KNO-ORG',
    {
      message:
        'Rate limit triggered for organization 738b2cc0-401b-4226-89ea-f49c9441d40f: ' +
        'maximum of 10 requests in 1000ms exceeded.',
      environment: 'test',
    },
  ],
  [
    'INTEROP_APIGW_IASA4_AUT-SER-UNE-CLI-ASS-AUD',
    {
      message:
        'Client assertion validation failed for clientId: client-123 - ' +
        'Unexpected client assertion audience: auth.uat.interop.pagopa.it/client-assertion',
    },
  ],
  [
    'INTEROP_APIGW_IASA4_AUT-SER-ORG-REQ-LIM-EXC',
    { message: 'Too Many Requests - detail: Requests limit exceeded for organization organization-123' },
  ],
  [
    'INTEROP_APIGW_IASA4_AUT-SER-TOK-GEN-STA-ENT-NOT-FOU',
    { message: 'Entry with PK KID-123 not found in token-generation-states table' },
  ],
  [
    'INTEROP_APIGW_IASA4_AUT-SER-CLI-ASS-SIG-VAL-FAI',
    {
      message:
        'Client assertion signature validation failed for client client-123 - Client assertion signature is invalid',
    },
  ],
  [
    'INTEROP_APIGW_IASA4_AUT-SER-UNE-KID-FOR',
    {
      message:
        'Client assertion validation failed for clientId: 28a14b06-a11c-4155-9827-60db9ea5a148 - ' +
        'Unexpected format for kid',
    },
  ],
  [
    'INTEROP_APIGW_IASA4_AUT-SER-PLA-STA-INA',
    {
      message:
        'errors: 007-0008, Platform state validation failed - Agreement state is: INACTIVE, ' +
        'Purpose state is: INACTIVE',
    },
  ],
  [
    'INTEROP_APIGW_IASA4_AUT-SER-API-GAT-FOR-403',
    { message: 'API Gateway 403 GET /token.oauth2 sourceIp=203.0.113.10', source: 'API_GATEWAY' },
  ],
]);

describe('INTEROP auth-server API Gateway known errors', () => {
  it('distinguishes not-before validation from an invalid cryptographic signature', () => {
    const message = FIXTURES.get('INTEROP_APIGW_IASA4_AUT-SER-CLI-ASS-NOT-BEF')?.message ?? '';
    assert.strictEqual(caseMatches(byId('INTEROP_APIGW_IASA4_AUT-SER-CLI-ASS-NOT-BEF'), context({ message })), true);
    assert.strictEqual(
      caseMatches(byId('INTEROP_APIGW_IASA4_AUT-SER-CLI-ASS-SIG-VAL-FAI'), context({ message })),
      false,
    );
  });

  it('distinguishes expired assertions from invalid signatures and not-before failures', () => {
    const message = FIXTURES.get('INTEROP_APIGW_IASA4_AUT-SER-CLI-ASS-EXP')?.message ?? '';
    assert.strictEqual(caseMatches(byId('INTEROP_APIGW_IASA4_AUT-SER-CLI-ASS-EXP'), context({ message })), true);
    for (const id of [
      'INTEROP_APIGW_IASA4_AUT-SER-CLI-ASS-NOT-BEF',
      'INTEROP_APIGW_IASA4_AUT-SER-CLI-ASS-SIG-VAL-FAI',
    ]) {
      assert.strictEqual(caseMatches(byId(id), context({ message })), false);
    }
  });

  it('matches validation fields through JSON escaping without matching different field names', () => {
    for (const [id, field, detail] of [
      ['INTEROP_APIGW_IASA4_AUT-SER-INV-CLI-ID-UUI', 'client_id', 'Invalid uuid'],
      ['INTEROP_APIGW_IASA4_AUT-SER-REQ-CLI-ASS-TYP', 'client_assertion_type', 'Required'],
    ]) {
      assert.ok(id && field && detail);
      const knownError = byId(id);
      for (const encode of [false, true]) {
        const message: string = `Validation error: ${detail} at "${field}"`;
        assert.strictEqual(
          caseMatches(knownError, context({ message: encode ? JSON.stringify({ log: message }) : message })),
          true,
        );
      }
      for (const message of [
        `Validation error: ${detail} at "${field}_backup"`,
        `Validation error: ${detail} at "other_field", ${field} is present`,
      ]) {
        assert.strictEqual(caseMatches(knownError, context({ message })), false);
      }
    }
  });

  it('recognizes either inactive state without requiring both to be inactive', () => {
    const knownError = byId('INTEROP_APIGW_IASA4_AUT-SER-PLA-STA-AGR-OR-PUR-INA');
    for (const entity of ['Agreement', 'Purpose']) {
      assert.strictEqual(
        caseMatches(
          knownError,
          context({ message: `Platform state validation failed - ${entity} state is: INACTIVE` }),
        ),
        true,
      );
      assert.strictEqual(
        caseMatches(knownError, context({ message: `Platform state validation failed - ${entity} state is: ACTIVE` })),
        false,
      );
    }
  });

  it('matches every case against its documented evidence', () => {
    for (const knownError of KNOWN_ERRORS) {
      const fixture = FIXTURES.get(knownError.code);
      assert.ok(fixture !== undefined, `missing fixture for ${knownError.code}`);
      assert.strictEqual(caseMatches(knownError, context(fixture)), true, knownError.code);
    }
  });

  it('restricts the organization-specific rate-limit case to test', () => {
    const knownError = byId('INTEROP_APIGW_IASA4_AUT-SER-TES-RAT-LIM-KNO-ORG');
    const fixture = FIXTURES.get(knownError.code);
    assert.ok(fixture !== undefined);
    assert.strictEqual(caseMatches(knownError, context({ ...fixture, environment: 'prod' })), false);
  });

  it('matches API Gateway 403 only in access-log evidence', () => {
    const knownError = byId('INTEROP_APIGW_IASA4_AUT-SER-API-GAT-FOR-403');
    const message = FIXTURES.get(knownError.code)?.message ?? '';
    assert.strictEqual(caseMatches(knownError, context({ message, source: 'API_GATEWAY' })), true);
    assert.strictEqual(caseMatches(knownError, context({ message, source: 'APPLICATION' })), false);
  });

  it('ranks the API Gateway 403 catch-all below any application diagnosis', () => {
    const forbidden = FIXTURES.get('INTEROP_APIGW_IASA4_AUT-SER-API-GAT-FOR-403')?.message ?? '';
    const ctx = conditionContext([
      [AUTH_SERVER_ALARM.stepIds.queryApiGwAggregates, [[{ field: 'message', value: forbidden }]]],
      [
        AUTH_SERVER_ALARM.stepIds.queryApplicationLogs,
        [[{ field: 'message', value: 'Validation error: Invalid uuid at "client_id"' }]],
      ],
    ]);
    assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, ctx), [
      'INTEROP_APIGW_IASA4_AUT-SER-INV-CLI-ID-UUI',
      'INTEROP_APIGW_IASA4_AUT-SER-API-GAT-FOR-403',
    ]);
  });

  it('does not classify the explicitly excluded invalid-claims warning', () => {
    const invalidClaims = context({
      message:
        '[CLIENTID=client] Invalid claims in client assertion payload: ' +
        '[{"code":"unrecognized_keys","keys":["nbf"]}]',
    });
    assert.ok(matchingKnownErrorCodes(KNOWN_ERRORS, invalidClaims).length === 0);
  });
});

function context(fixture: Fixture): RunbookContext {
  const sourceStep =
    fixture.source === 'API_GATEWAY'
      ? AUTH_SERVER_ALARM.stepIds.queryApiGwAggregates
      : AUTH_SERVER_ALARM.stepIds.queryApplicationLogs;
  return conditionContext([[sourceStep, [[{ field: 'message', value: fixture.message }]]]], fixture.environment);
}

function byId(id: string): ReturnType<typeof knownErrorById> {
  return knownErrorById(KNOWN_ERRORS, id);
}
