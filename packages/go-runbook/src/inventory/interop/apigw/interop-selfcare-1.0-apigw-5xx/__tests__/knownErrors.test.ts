import { SELFCARE_ALARM } from '../alarmDefinition.js';
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
  readonly source?: 'APPLICATION' | 'API_GATEWAY' | 'CID_TRACKER';
}

const FIXTURES: ReadonlyMap<string, Fixture> = new Map([
  [
    'INTEROP_APIGW_IS10A5_TEN-NOT-FOU-KNO-SEL-ID',
    { message: 'Tenant with selfcareId 56f4f576-af5e-4a90-8be2-1ac78dec899f not found' },
  ],
  [
    'INTEROP_APIGW_IS10A5_BFF-UNR-NOT-IN-APP-MAN-UNA',
    { message: 'Error while fetching unread notifications: Error: connect ECONNREFUSED 10.1.2.37:8088' },
  ],
  [
    'INTEROP_APIGW_IS10A5_BFF-S3-LIS-BUC-NOT-AUT',
    { message: 'User: arn:aws:iam::123:role/bff is not authorized to perform: s3:ListBucket on resource: bucket' },
  ],
  ['INTEROP_APIGW_IS10A5_BFF-SEL-PRO-RET-ERR', { message: 'Error retrieving products for institution 123' }],
  [
    'INTEROP_APIGW_IS10A5_BFF-SEL-USE-504',
    {
      message:
        'GET https://api.selfcare.pagopa.it/external/v2/institutions/id/users 504 Gateway Time-out ' +
        'Error while retrieving users corresponding to tenant id: Axios Error: Request failed with status code 504',
      environment: 'prod',
    },
  ],
  [
    'INTEROP_APIGW_IS10A5_BFF-SEL-USE-500',
    {
      message:
        'ERROR -  [CID=72981aaf-9e1b-40f0-baa5-3ace6919c576][SelfcareV2ClientApi Institution Client][Error] GET https://api.selfcare.pagopa.it/external/v2/institutions/bcf7f5a8-8bcf-425e-8d59-cc7c2db678e5/users 500:Internal Server Error',
      environment: 'prod',
    },
  ],
  [
    'INTEROP_APIGW_IS10A5_BFF-ESE-DOC-KEY-NOT-FOU',
    {
      message:
        'Error getting file eservices/docs/0b3c1c2e-7d1a-4d2e-9a3f-1f2e3d4c5b6a/IT-Wallet-RC040-Tesserino-Venatorio.json in bucket interop-application-documents-test-es1: The specified key does not exist.',
      environment: 'test',
    },
  ],
  [
    'INTEROP_APIGW_IS10A5_BFF-KAF-LOC-TIM',
    {
      message: 'KafkaJSLockTimeout: Timeout while acquiring lock (1 waiting locks): connect to broker b-1:9098',
      environment: 'test',
    },
  ],
  [
    'INTEROP_APIGW_IS10A5_BFF-SIG-CON-RES-503',
    { message: '[CID=cid-1] Response 503 Service Unavailable', environment: 'test' },
  ],
  [
    'INTEROP_APIGW_IS10A5_BFF-TEN-KIN-ERR-004-0004',
    { message: 'errors: 004-0004, Tenant kind for tenant 3501e329-7853-4d25-a75a-8a1b4a13b359 not found' },
  ],
  ['INTEROP_APIGW_IS10A5_TEN-NOT-FOU-SEL-ID', { message: 'Tenant with selfcareId unknown-selfcare-id not found' }],
  [
    'INTEROP_APIGW_IS10A5_BFF-SES-TOK-ORI-NOT-ALL',
    {
      message:
        'Error creating a session token: Tenant origin is not allowed and SelfcareID id does not belong to allow list',
    },
  ],
  ['INTEROP_APIGW_IS10A5_BFF-ERR-CRE-ESE-DES', { message: 'Error creating descriptor in EService e60cd553' }],
  [
    'INTEROP_APIGW_IS10A5_BFF-ERR-CRE-ESE-TEM-DOC',
    { message: 'Error creating eService template document of kind INTERFACE and name Specifica API' },
  ],
  [
    'INTEROP_APIGW_IS10A5_BFF-SEL-ENT-NOT-FIL',
    {
      message: 'errors: 008-0003, Selfcare entity UserInstitutionResource with field unknown not filled',
    },
  ],
  [
    'INTEROP_APIGW_IS10A5_BFF-INV-CON-DIS-HEA',
    { message: 'TypeError [ERR_INVALID_CHAR]: Invalid character in header content ["Content-Disposition"]' },
  ],
  [
    'INTEROP_APIGW_IS10A5_BFF-ADM-ZIP-INV-FOR',
    { message: 'ADM-ZIP: Invalid or unsupported zip format. No END header found' },
  ],
  [
    'INTEROP_APIGW_IS10A5_PUR-PRO-ECO-OR-SOC-HAN-UP',
    { message: 'errors: 008-9991, Unexpected error - original error: Error: read ECONNRESET' },
  ],
  ['INTEROP_APIGW_IS10A5_PUR-PRO-TEN-KIN-NOT-FOU', { message: 'Tenant kind for tenant 686a2f1b not found' }],
  [
    'INTEROP_APIGW_IS10A5_PUR-PRO-PDF-GEN-TIM',
    { message: 'Error: Error during pdf generation : Navigation timeout of 30000 ms exceeded' },
  ],
  ['INTEROP_APIGW_IS10A5_TEN-PRO-REA-MOD-CON-REF', { message: 'Error: connect ECONNREFUSED 10.0.28.230:5432' }],
  [
    'INTEROP_APIGW_IS10A5_BFF-SAM-NOT-ON-OR-AFT-NOT-COM',
    {
      message:
        'Error while validating saml -> Conditions NotOnOrAfter are not compliant. Returning a generic error response.',
    },
  ],
  [
    'INTEROP_APIGW_IS10A5_AUT-PRO-INV-API-ROL',
    {
      message: 'title: Unauthorized - detail: Invalid roles ["api"] for this operation - errors: Invalid roles ["api"]',
    },
  ],
  ['INTEROP_APIGW_IS10A5_BFF-TOK-EXP', { message: 'Token verification failed: TokenExpiredError: jwt expired' }],
  [
    'INTEROP_APIGW_IS10A5_BFF-ERR-GET-PUB-KEY',
    { message: 'JsonWebTokenError: error in secret or public key callback: Error getting signing key' },
  ],
  ['INTEROP_APIGW_IS10A5_BFF-PRI-NOT-TOS-RET-ERR', { message: 'Error retrieving privacy notices for consentType TOS' }],
  [
    'INTEROP_APIGW_IS10A5_DUP-EVE-STR-VER',
    {
      message:
        'Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"',
    },
  ],
  [
    'INTEROP_APIGW_IS10A5_API-GAT-BAC-TIM-504',
    { message: 'Execution failed due to a timeout error', source: 'API_GATEWAY' },
  ],
]);

describe('INTEROP Selfcare API Gateway known errors', () => {
  it('matches every documented case against its expected evidence source', () => {
    for (const knownError of KNOWN_ERRORS) {
      const fixture = FIXTURES.get(knownError.code);
      assert.ok(fixture !== undefined, `missing fixture for known error: ${knownError.code}`);
      assert.strictEqual(caseMatches(knownError, context(fixture)), true, `expected match: ${knownError.code}`);
    }
  });

  it('does not route an unknown tenant through the explicitly known SelfcareID case', () => {
    const knownId = byId('INTEROP_APIGW_IS10A5_TEN-NOT-FOU-KNO-SEL-ID');
    const generic = byId('INTEROP_APIGW_IS10A5_TEN-NOT-FOU-SEL-ID');
    const unknownContext = context({ message: 'Tenant with selfcareId brand-new-id not found' });

    assert.strictEqual(caseMatches(knownId, unknownContext), false);
    assert.strictEqual(caseMatches(generic, unknownContext), true);
  });

  it('suppresses a known SelfcareID when same-line details surround the ID', () => {
    const knownId = byId('INTEROP_APIGW_IS10A5_TEN-NOT-FOU-KNO-SEL-ID');
    const generic = byId('INTEROP_APIGW_IS10A5_TEN-NOT-FOU-SEL-ID');
    const detailedContext = context({
      message:
        'Tenant with selfcareId lookup detail: 56f4f576-af5e-4a90-8be2-1ac78dec899f in tenant read model not found',
      environment: 'prod',
    });

    assert.strictEqual(caseMatches(knownId, detailedContext), true);
    assert.strictEqual(caseMatches(generic, detailedContext), false);
  });

  it('keeps an unlisted SelfcareID actionable when another evidence row contains a listed ID', () => {
    const knownId = byId('INTEROP_APIGW_IS10A5_TEN-NOT-FOU-KNO-SEL-ID');
    const generic = byId('INTEROP_APIGW_IS10A5_TEN-NOT-FOU-SEL-ID');
    const mixedContext = context({ message: '', environment: 'prod' }, [
      'Tenant with selfcareId 56f4f576-af5e-4a90-8be2-1ac78dec899f not found',
      'Tenant with selfcareId brand-new-id not found',
    ]);

    assert.strictEqual(caseMatches(knownId, mixedContext), true);
    assert.strictEqual(caseMatches(generic, mixedContext), true);
    // Two distinct errors: both are reported, the actionable one is not hidden by the suppression.
    assert.deepStrictEqual(matchingKnownErrorCodes(KNOWN_ERRORS, mixedContext), [knownId.code, generic.code]);
  });

  it('suppresses each documented SelfcareID only in its listed environments', () => {
    const knownId = byId('INTEROP_APIGW_IS10A5_TEN-NOT-FOU-KNO-SEL-ID');
    const generic = byId('INTEROP_APIGW_IS10A5_TEN-NOT-FOU-SEL-ID');
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
    const knownError = byId('INTEROP_APIGW_IS10A5_BFF-SEL-ENT-NOT-FIL');
    const messages = [
      'errors: 008-0003, Selfcare entity UserInstitutionResource with field unknown not filled',
      'Selfcare Entity not filled - detail: Selfcare entity UserInstitutionResource with field unknown not filled',
    ];

    for (const message of messages) {
      for (const environment of ['prod', 'test', 'att'] as const) {
        for (const source of ['APPLICATION', 'CID_TRACKER'] as const) {
          assert.strictEqual(
            caseMatches(knownError, context({ message, environment, source })),
            environment !== 'att',
            `${environment}: ${source}: ${message}`,
          );
        }
      }
    }
    assert.strictEqual(
      caseMatches(knownError, context({ message: 'errors: 008-0003, a different provider error' })),
      false,
    );
  });

  it('keeps the BFF 004-0004 tenant-kind case separate from the purpose-process generic case', () => {
    const specific = byId('INTEROP_APIGW_IS10A5_BFF-TEN-KIN-ERR-004-0004');
    const generic = byId('INTEROP_APIGW_IS10A5_PUR-PRO-TEN-KIN-NOT-FOU');
    const specificContext = context({
      message: 'errors: 004-0004, Tenant kind for tenant 3501e329-7853-4d25-a75a-8a1b4a13b359 not found',
    });

    assert.strictEqual(caseMatches(specific, specificContext), true);
    assert.strictEqual(caseMatches(generic, specificContext), false);
  });

  it('enforces environment restrictions on test-only and prod-only cases', () => {
    const kafka = byId('INTEROP_APIGW_IS10A5_BFF-KAF-LOC-TIM');
    const selfcare504 = byId('INTEROP_APIGW_IS10A5_BFF-SEL-USE-504');
    const kafkaMessage = FIXTURES.get(kafka.code)?.message ?? '';
    const selfcareMessage = FIXTURES.get(selfcare504.code)?.message ?? '';

    assert.strictEqual(caseMatches(kafka, context({ message: kafkaMessage, environment: 'prod' })), false);
    assert.strictEqual(caseMatches(kafka, context({ message: kafkaMessage, environment: 'test' })), true);
    assert.strictEqual(caseMatches(selfcare504, context({ message: selfcareMessage, environment: 'test' })), false);
    assert.strictEqual(caseMatches(selfcare504, context({ message: selfcareMessage, environment: 'prod' })), true);
  });

  it('routes unread-notifications 401 to the expired-token case, not to the PIN-9041 availability case', () => {
    const tokenExpired = byId('INTEROP_APIGW_IS10A5_BFF-TOK-EXP');
    const notificationManagerUnavailable = byId('INTEROP_APIGW_IS10A5_BFF-UNR-NOT-IN-APP-MAN-UNA');
    const unreadNotifications401 = context({
      message: 'Error while fetching unread notifications: AxiosError: Request failed with status code 401',
    });

    assert.strictEqual(caseMatches(tokenExpired, unreadNotifications401), true);
    assert.strictEqual(caseMatches(notificationManagerUnavailable, unreadNotifications401), false);
  });

  it('matches the API Gateway timeout only in aggregate access-log evidence', () => {
    const timeout = byId('INTEROP_APIGW_IS10A5_API-GAT-BAC-TIM-504');
    const message = FIXTURES.get(timeout.code)?.message ?? '';

    assert.strictEqual(caseMatches(timeout, context({ message, source: 'API_GATEWAY' })), true);
    assert.strictEqual(caseMatches(timeout, context({ message, source: 'APPLICATION' })), false);
  });

  it('matches the duplicate-event case in a JSON-encoded CloudWatch CID tracker row', () => {
    const duplicateEvent = byId('INTEROP_APIGW_IS10A5_DUP-EVE-STR-VER');
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

function byId(id: string): ReturnType<typeof knownErrorById> {
  return knownErrorById(KNOWN_ERRORS, id);
}
