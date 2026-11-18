import { SELFCARE_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RunbookContext } from '../../../../../engine/index.js';
import { conditionContext } from '../../../shared/__tests__/helpers/knownCaseTesting.js';
import { caseMatches, knownCaseById, matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { KNOWN_CASES } from '../knownCases.js';

interface Fixture {
  readonly message: string;
  readonly environment?: 'prod' | 'att' | 'test';
  readonly source?: 'APPLICATION' | 'API_GATEWAY' | 'CID_TRACKER';
}

const FIXTURES: ReadonlyMap<string, Fixture> = new Map([
  [
    'tenant-not-found-known-selfcare-id',
    { message: 'Tenant with selfcareId 56f4f576-af5e-4a90-8be2-1ac78dec899f not found' },
  ],
  [
    'bff-unread-notifications-in-app-manager-unavailable',
    { message: 'Error while fetching unread notifications: Error: connect ECONNREFUSED 10.1.2.37:8088' },
  ],
  [
    'bff-s3-list-bucket-not-authorized',
    { message: 'User: arn:aws:iam::123:role/bff is not authorized to perform: s3:ListBucket on resource: bucket' },
  ],
  ['bff-selfcare-products-retrieval-error', { message: 'Error retrieving products for institution 123' }],
  [
    'bff-selfcare-users-504',
    {
      message:
        'GET https://api.selfcare.pagopa.it/external/v2/institutions/id/users 504 Gateway Time-out ' +
        'Error while retrieving users corresponding to tenant id: Axios Error: Request failed with status code 504',
      environment: 'prod',
    },
  ],
  [
    'bff-kafka-lock-timeout',
    {
      message: 'KafkaJSLockTimeout: Timeout while acquiring lock (1 waiting locks): connect to broker b-1:9098',
      environment: 'test',
    },
  ],
  [
    'bff-signed-contract-response-503',
    { message: '[CID=cid-1] Response 503 Service Unavailable', environment: 'test' },
  ],
  [
    'bff-tenant-kind-error-004-0004',
    { message: 'errors: 004-0004, Tenant kind for tenant 3501e329-7853-4d25-a75a-8a1b4a13b359 not found' },
  ],
  ['tenant-not-found-selfcare-id', { message: 'Tenant with selfcareId unknown-selfcare-id not found' }],
  [
    'bff-session-token-origin-not-allowed',
    {
      message:
        'Error creating a session token: Tenant origin is not allowed and SelfcareID id does not belong to allow list',
    },
  ],
  ['bff-error-creating-eservice-descriptor', { message: 'Error creating descriptor in EService e60cd553' }],
  [
    'bff-error-creating-eservice-template-document',
    { message: 'Error creating eService template document of kind INTERFACE and name Specifica API' },
  ],
  [
    'bff-selfcare-entity-not-filled',
    {
      message: 'errors: 008-0003, Selfcare entity UserInstitutionResource with field unknown not filled',
    },
  ],
  [
    'bff-invalid-content-disposition-header',
    { message: 'TypeError [ERR_INVALID_CHAR]: Invalid character in header content ["Content-Disposition"]' },
  ],
  ['bff-adm-zip-invalid-format', { message: 'ADM-ZIP: Invalid or unsupported zip format. No END header found' }],
  [
    'purpose-process-econnreset-or-socket-hang-up',
    { message: 'errors: 008-9991, Unexpected error - original error: Error: read ECONNRESET' },
  ],
  ['purpose-process-tenant-kind-not-found', { message: 'Tenant kind for tenant 686a2f1b not found' }],
  [
    'purpose-process-pdf-generation-timeout',
    { message: 'Error: Error during pdf generation : Navigation timeout of 30000 ms exceeded' },
  ],
  ['tenant-process-read-model-connection-refused', { message: 'Error: connect ECONNREFUSED 10.0.28.230:5432' }],
  [
    'bff-saml-not-on-or-after-not-compliant',
    {
      message:
        'Error while validating saml -> Conditions NotOnOrAfter are not compliant. Returning a generic error response.',
    },
  ],
  [
    'authorization-process-invalid-api-role',
    {
      message: 'title: Unauthorized - detail: Invalid roles ["api"] for this operation - errors: Invalid roles ["api"]',
    },
  ],
  ['bff-token-expired', { message: 'Token verification failed: TokenExpiredError: jwt expired' }],
  [
    'bff-error-getting-public-key',
    { message: 'JsonWebTokenError: error in secret or public key callback: Error getting signing key' },
  ],
  ['bff-privacy-notices-tos-retrieval-error', { message: 'Error retrieving privacy notices for consentType TOS' }],
  [
    'duplicate-event-stream-version',
    {
      message:
        'Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"',
    },
  ],
  ['api-gateway-backend-timeout-504', { message: 'Execution failed due to a timeout error', source: 'API_GATEWAY' }],
]);

describe('INTEROP Selfcare API Gateway known cases', () => {
  it('matches every documented case against its expected evidence source', () => {
    for (const knownCase of KNOWN_CASES) {
      const fixture = FIXTURES.get(knownCase.id);
      assert.ok(fixture !== undefined, `missing fixture for known case: ${knownCase.id}`);
      assert.strictEqual(caseMatches(knownCase, context(fixture)), true, `expected match: ${knownCase.id}`);
    }
  });

  it('does not route an unknown tenant through the explicitly known SelfcareID case', () => {
    const knownId = byId('tenant-not-found-known-selfcare-id');
    const generic = byId('tenant-not-found-selfcare-id');
    const unknownContext = context({ message: 'Tenant with selfcareId brand-new-id not found' });

    assert.strictEqual(caseMatches(knownId, unknownContext), false);
    assert.strictEqual(caseMatches(generic, unknownContext), true);
  });

  it('suppresses a known SelfcareID when same-line details surround the ID', () => {
    const knownId = byId('tenant-not-found-known-selfcare-id');
    const generic = byId('tenant-not-found-selfcare-id');
    const detailedContext = context({
      message:
        'Tenant with selfcareId lookup detail: 56f4f576-af5e-4a90-8be2-1ac78dec899f in tenant read model not found',
      environment: 'prod',
    });

    assert.strictEqual(caseMatches(knownId, detailedContext), true);
    assert.strictEqual(caseMatches(generic, detailedContext), false);
  });

  it('keeps an unlisted SelfcareID actionable when another evidence row contains a listed ID', () => {
    const knownId = byId('tenant-not-found-known-selfcare-id');
    const generic = byId('tenant-not-found-selfcare-id');
    const mixedContext = context({ message: '', environment: 'prod' }, [
      'Tenant with selfcareId 56f4f576-af5e-4a90-8be2-1ac78dec899f not found',
      'Tenant with selfcareId brand-new-id not found',
    ]);

    assert.strictEqual(caseMatches(knownId, mixedContext), true);
    assert.strictEqual(caseMatches(generic, mixedContext), true);
    // The actionable generic case outranks the suppression of the listed ID.
    assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, mixedContext), [generic.id, knownId.id]);
  });

  it('suppresses each documented SelfcareID only in its listed environments', () => {
    const knownId = byId('tenant-not-found-known-selfcare-id');
    const generic = byId('tenant-not-found-selfcare-id');
    const environments = ['prod', 'att', 'test'] as const;
    // Independently transcribed from the Confluence v103 exclusion table.
    const exclusions: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
      ['56f4f576-af5e-4a90-8be2-1ac78dec899f', environments],
      ['fc7b97a0-e921-454f-b744-4c09ae40c663', environments],
      ['1219c34e-9797-45e9-a1e7-da9fb35ed468', environments],
      ['560a56a0-745a-44cf-b228-0493ec48dce8', ['test', 'prod']],
      ['acb68e12-103c-4e43-983a-13ae587a6240', environments],
      ['02184e01-fff2-4170-9d8c-c52867fca6f6', environments],
      ['9357291b-3a55-4351-af16-61dcacf88b80', environments],
      ['7467fffd-9e43-40a9-b74f-59e4d661f9fe', ['test', 'prod']],
      ['0a0da251-1568-4fed-82b5-10d6ccc1de7e', ['prod', 'att']],
      ['627dc018-0e91-47b5-9532-d0c8832f239f', ['prod']],
      ['a4cfa606-8981-4def-84f8-781149adb63d', ['prod']],
      ['8a8753ef-8adc-4baa-bfb4-22a0b39c2cdd', ['att']],
      ['418ea95f-552d-4a51-8968-5b5c7531f6c9', ['prod']],
      ['4ee1cabf-53f4-469b-8b4b-9ac933ec1b4e', ['prod']],
      ['987cf14e-e746-4c85-8898-dbe960dbf11c', ['prod']],
    ];

    for (const [id, allowedEnvironments] of exclusions) {
      for (const environment of environments) {
        const fixture = context({
          message: `Tenant not found by selfcareId - detail: Tenant with selfcareId ${id} not found`,
          environment,
        });
        const suppressed = allowedEnvironments.includes(environment);
        assert.strictEqual(caseMatches(knownId, fixture), suppressed, `${id} in ${environment}`);
        assert.strictEqual(caseMatches(generic, fixture), !suppressed, `${id} in ${environment}`);
      }
    }
  });

  it('recognizes both PIN-7068 message formats as expected provider-data failures in prod and test', () => {
    const knownCase = byId('bff-selfcare-entity-not-filled');
    const messages = [
      'errors: 008-0003, Selfcare entity UserInstitutionResource with field unknown not filled',
      'Selfcare Entity not filled - detail: Selfcare entity UserInstitutionResource with field unknown not filled',
    ];

    for (const message of messages) {
      for (const environment of ['prod', 'test', 'att'] as const) {
        for (const source of ['APPLICATION', 'CID_TRACKER'] as const) {
          assert.strictEqual(
            caseMatches(knownCase, context({ message, environment, source })),
            environment !== 'att',
            `${environment}: ${source}: ${message}`,
          );
        }
      }
    }
    assert.strictEqual(
      caseMatches(knownCase, context({ message: 'errors: 008-0003, a different provider error' })),
      false,
    );
  });

  it('keeps the BFF 004-0004 tenant-kind case separate from the purpose-process generic case', () => {
    const specific = byId('bff-tenant-kind-error-004-0004');
    const generic = byId('purpose-process-tenant-kind-not-found');
    const specificContext = context({
      message: 'errors: 004-0004, Tenant kind for tenant 3501e329-7853-4d25-a75a-8a1b4a13b359 not found',
    });

    assert.strictEqual(caseMatches(specific, specificContext), true);
    assert.strictEqual(caseMatches(generic, specificContext), false);
  });

  it('enforces environment restrictions on test-only and prod-only cases', () => {
    const kafka = byId('bff-kafka-lock-timeout');
    const selfcare504 = byId('bff-selfcare-users-504');
    const kafkaMessage = FIXTURES.get(kafka.id)?.message ?? '';
    const selfcareMessage = FIXTURES.get(selfcare504.id)?.message ?? '';

    assert.strictEqual(caseMatches(kafka, context({ message: kafkaMessage, environment: 'prod' })), false);
    assert.strictEqual(caseMatches(kafka, context({ message: kafkaMessage, environment: 'test' })), true);
    assert.strictEqual(caseMatches(selfcare504, context({ message: selfcareMessage, environment: 'test' })), false);
    assert.strictEqual(caseMatches(selfcare504, context({ message: selfcareMessage, environment: 'prod' })), true);
  });

  it('routes unread-notifications 401 to the expired-token case, not to the PIN-9041 availability case', () => {
    const tokenExpired = byId('bff-token-expired');
    const notificationManagerUnavailable = byId('bff-unread-notifications-in-app-manager-unavailable');
    const unreadNotifications401 = context({
      message: 'Error while fetching unread notifications: AxiosError: Request failed with status code 401',
    });

    assert.strictEqual(caseMatches(tokenExpired, unreadNotifications401), true);
    assert.strictEqual(caseMatches(notificationManagerUnavailable, unreadNotifications401), false);
  });

  it('matches the API Gateway timeout only in aggregate access-log evidence', () => {
    const timeout = byId('api-gateway-backend-timeout-504');
    const message = FIXTURES.get(timeout.id)?.message ?? '';

    assert.strictEqual(caseMatches(timeout, context({ message, source: 'API_GATEWAY' })), true);
    assert.strictEqual(caseMatches(timeout, context({ message, source: 'APPLICATION' })), false);
  });

  it('matches the duplicate-event case in a JSON-encoded CloudWatch CID tracker row', () => {
    const duplicateEvent = byId('duplicate-event-stream-version');
    const message = JSON.stringify({
      log:
        'ERROR [notification-config-process] - Error creating event: error: duplicate key value violates ' +
        'unique constraint "events_stream_id_version_key"',
      pod_app: 'interop-be-notification-config-process',
      pod_namespace: 'prod',
      stream: 'stderr',
    });

    assert.strictEqual(caseMatches(duplicateEvent, context({ message, source: 'CID_TRACKER' })), true);
  });
});

function context(fixture: Fixture, messages: ReadonlyArray<string> = [fixture.message]): RunbookContext {
  const rows = messages.map((message) => [
    { field: 'pod_app', value: 'interop-be-backend-for-frontend' },
    { field: '@message', value: message },
    { field: 'integrationError', value: message },
  ]);
  const sourceStep =
    fixture.source === 'API_GATEWAY'
      ? SELFCARE_ALARM.stepIds.queryApiGwAggregates
      : fixture.source === 'CID_TRACKER'
        ? SELFCARE_ALARM.stepIds.queryCidTracker
        : SELFCARE_ALARM.stepIds.queryApplicationLogs;
  return conditionContext([[sourceStep, rows]], fixture.environment);
}

function byId(id: string): ReturnType<typeof knownCaseById> {
  return knownCaseById(KNOWN_CASES, id);
}
