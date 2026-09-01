import { SELFCARE_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KNOWN_CASES } from '../knownCases.js';
import { createTestServiceRegistry } from '../../../../services/createTestServiceRegistry.js';
import { ConditionEvaluator, type KnownCase, type RunbookContext } from '../../framework.js';

interface Fixture {
  readonly message: string;
  readonly environment?: 'prod' | 'att' | 'test';
  readonly source?: 'APPLICATION' | 'API_GATEWAY' | 'CID_TRACKER';
}

interface LogRowField {
  readonly field: string;
  readonly value: string;
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
      message:
        'Selfcare Entity not filled - detail: Selfcare entity UserInstitutionResource with field unknown not filled',
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
  const evaluator = new ConditionEvaluator();

  it('has a realistic fixture, a unique id and a unique priority for every case', () => {
    assert.strictEqual(FIXTURES.size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.priority)).size, KNOWN_CASES.length);
  });

  it('ranks every actionable case above completed cases and keeps the SelfcareID suppression last', () => {
    const actionablePriorities = KNOWN_CASES.filter(
      (knownCase) => knownCase.analysis?.proposedStatus === 'IN_PROGRESS',
    ).map((knownCase) => knownCase.priority);
    const completedPriorities = KNOWN_CASES.filter(
      (knownCase) => knownCase.analysis?.proposedStatus === 'COMPLETED',
    ).map((knownCase) => knownCase.priority);

    assert.ok(actionablePriorities.length > 0);
    assert.ok(completedPriorities.length > 0);
    assert.ok(Math.min(...actionablePriorities) > Math.max(...completedPriorities));
    assert.strictEqual(
      knownCaseById('tenant-not-found-known-selfcare-id').priority,
      Math.min(...KNOWN_CASES.map((knownCase) => knownCase.priority)),
    );
  });

  it('matches every documented case against its expected evidence source', () => {
    for (const knownCase of KNOWN_CASES) {
      const fixture = FIXTURES.get(knownCase.id);
      assert.ok(fixture !== undefined, `missing fixture for known case: ${knownCase.id}`);
      assert.strictEqual(
        evaluator.evaluate(knownCase.condition, context(fixture)),
        true,
        `expected match: ${knownCase.id}`,
      );
    }
  });

  it('does not route an unknown tenant through the explicitly known SelfcareID case', () => {
    const knownId = knownCaseById('tenant-not-found-known-selfcare-id');
    const generic = knownCaseById('tenant-not-found-selfcare-id');
    const unknownContext = context({ message: 'Tenant with selfcareId brand-new-id not found' });

    assert.strictEqual(evaluator.evaluate(knownId.condition, unknownContext), false);
    assert.strictEqual(evaluator.evaluate(generic.condition, unknownContext), true);
  });

  it('keeps the BFF 004-0004 tenant-kind case separate from the purpose-process generic case', () => {
    const specific = knownCaseById('bff-tenant-kind-error-004-0004');
    const generic = knownCaseById('purpose-process-tenant-kind-not-found');
    const specificContext = context({
      message: 'errors: 004-0004, Tenant kind for tenant 3501e329-7853-4d25-a75a-8a1b4a13b359 not found',
    });

    assert.strictEqual(evaluator.evaluate(specific.condition, specificContext), true);
    assert.strictEqual(evaluator.evaluate(generic.condition, specificContext), false);
  });

  it('enforces environment restrictions on test-only and prod-only cases', () => {
    const kafka = knownCaseById('bff-kafka-lock-timeout');
    const selfcare504 = knownCaseById('bff-selfcare-users-504');
    const kafkaMessage = FIXTURES.get(kafka.id)?.message ?? '';
    const selfcareMessage = FIXTURES.get(selfcare504.id)?.message ?? '';

    assert.strictEqual(
      evaluator.evaluate(kafka.condition, context({ message: kafkaMessage, environment: 'prod' })),
      false,
    );
    assert.strictEqual(
      evaluator.evaluate(kafka.condition, context({ message: kafkaMessage, environment: 'test' })),
      true,
    );
    assert.strictEqual(
      evaluator.evaluate(selfcare504.condition, context({ message: selfcareMessage, environment: 'test' })),
      false,
    );
    assert.strictEqual(
      evaluator.evaluate(selfcare504.condition, context({ message: selfcareMessage, environment: 'prod' })),
      true,
    );
  });

  it('routes unread-notifications 401 to the expired-token case, not to the PIN-9041 availability case', () => {
    const tokenExpired = knownCaseById('bff-token-expired');
    const notificationManagerUnavailable = knownCaseById('bff-unread-notifications-in-app-manager-unavailable');
    const unreadNotifications401 = context({
      message: 'Error while fetching unread notifications: AxiosError: Request failed with status code 401',
    });

    assert.strictEqual(evaluator.evaluate(tokenExpired.condition, unreadNotifications401), true);
    assert.strictEqual(evaluator.evaluate(notificationManagerUnavailable.condition, unreadNotifications401), false);
  });

  it('matches the API Gateway timeout only in aggregate access-log evidence', () => {
    const timeout = knownCaseById('api-gateway-backend-timeout-504');
    const message = FIXTURES.get(timeout.id)?.message ?? '';

    assert.strictEqual(evaluator.evaluate(timeout.condition, context({ message, source: 'API_GATEWAY' })), true);
    assert.strictEqual(evaluator.evaluate(timeout.condition, context({ message, source: 'APPLICATION' })), false);
  });

  it('matches the duplicate-event case in a JSON-encoded CloudWatch CID tracker row', () => {
    const duplicateEvent = knownCaseById('duplicate-event-stream-version');
    const message = JSON.stringify({
      log:
        'ERROR [notification-config-process] - Error creating event: error: duplicate key value violates ' +
        'unique constraint "events_stream_id_version_key"',
      pod_app: 'interop-be-notification-config-process',
      pod_namespace: 'prod',
      stream: 'stderr',
    });

    assert.strictEqual(evaluator.evaluate(duplicateEvent.condition, context({ message, source: 'CID_TRACKER' })), true);
  });
});

function context(fixture: Fixture): RunbookContext {
  const rows = applicationLogRows([fixture.message]);
  const sourceStep =
    fixture.source === 'API_GATEWAY'
      ? SELFCARE_ALARM.stepIds.queryApiGwAggregates
      : fixture.source === 'CID_TRACKER'
        ? SELFCARE_ALARM.stepIds.queryCidTracker
        : SELFCARE_ALARM.stepIds.queryApplicationLogs;
  return {
    executionId: 'test',
    startedAt: new Date('2026-08-24T09:10:11.000Z'),
    stepResults: new Map([[sourceStep, rows]]),
    vars: new Map([['interopEnvironment', fixture.environment ?? 'prod']]),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-08-24 09:10:11.000' },
    { field: 'pod_app', value: 'interop-be-backend-for-frontend' },
    { field: '@message', value: message },
    { field: 'integrationError', value: message },
  ]);
}

function knownCaseById(id: string): KnownCase {
  const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined, `known case not found: ${id}`);
  return knownCase;
}
