import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BFF_ALARM } from '../alarmDefinition.js';
import { AnalyzeBffEvidenceStep, BFF_EVIDENCE_STEP_ID } from '../AnalyzeBffEvidenceStep.js';
import { KNOWN_ERRORS } from '../knownErrors.js';
import type { RunbookContext } from '../../../../../engine/index.js';
import { cidTrackerOutput, conditionContext } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import type { LogRows } from '../../../../../__tests__/helpers/LogRows.js';
import { readEvidenceTime } from '../../../../../toolkits/common/parsing/aws/cloudwatch-logs/readEvidenceTime.js';

const DUPLICATE =
  'errors: 004-9991, Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"';
const EXPIRED = 'Token verification failed: TokenExpiredError: jwt expired';
const UNREAD_401 = 'Error while fetching unread notifications: AxiosError: Request failed with status code 401';
const USERS_WARN = 'Error while retrieving users corresponding to tenant tenant-1';
const USERS_504 =
  'errors: 008-9991, Unexpected error - original error: AxiosError: Request failed with status code 504';

function row(message: string, podApp = BFF_ALARM.podApp, cid?: string): LogRows[number] {
  return [
    { field: 'pod_app', value: podApp },
    { field: 'log', value: message },
    ...(cid === undefined ? [] : [{ field: 'cid', value: cid }]),
  ];
}

async function context(
  application: LogRows,
  tracker: ReturnType<typeof cidTrackerOutput> = [],
  environment = 'prod',
): Promise<RunbookContext> {
  const evidence: ReadonlyArray<readonly [string, unknown]> = [
    [BFF_ALARM.stepIds.queryApplicationLogs, application],
    [BFF_ALARM.stepIds.queryCidTracker, tracker],
  ];
  const result = await new AnalyzeBffEvidenceStep().execute(conditionContext(evidence, environment));
  assert.strictEqual(result.success, true);
  return conditionContext([...evidence, [BFF_EVIDENCE_STEP_ID, result.output]], environment);
}

const matches = (ctx: RunbookContext): ReadonlyArray<string> => matchingKnownErrorCodes(KNOWN_ERRORS, ctx);

describe('INTEROP BFF known errors', () => {
  const fixtures = [
    [
      'INTEROP_K8S_K8IBBFFE_BFF-INV-CON-DIS-HEA',
      'TypeError: Invalid character in header content ["Content-Disposition"]',
    ],
    ['INTEROP_K8S_K8IBBFFE_BFF-ADM-ZIP-INV-FOR', 'ADM-ZIP: Invalid or unsupported zip format. No END header found'],
    ['INTEROP_K8S_K8IBBFFE_BFF-TOK-EXP', EXPIRED],
    ['INTEROP_K8S_K8IBBFFE_BFF-ERR-GET-PUB-KEY', 'Error getting public key'],
    [
      'INTEROP_K8S_K8IBBFFE_BFF-ERR-GET-PUB-KEY',
      'Token verification failed: JsonWebTokenError: error in secret or public key callback: Error getting signing key',
    ],
    ['INTEROP_K8S_K8IBBFFE_BFF-AGR-API-ECO', 'errors: 008-9991, Unexpected error: read ECONNRESET'],
    ['INTEROP_K8S_K8IBBFFE_PUR-PRO-UNA-ECO', 'call to purpose-process failed: socket hang up'],
    ['INTEROP_K8S_K8IBBFFE_BFF-TEN-KIN-NOT-FOU', 'errors: 004-0004, Tenant kind for tenant tenant-1 not found'],
    ['INTEROP_K8S_K8IBBFFE_BFF-CON-REF-9098', 'Connection error: connect ECONNREFUSED 10.0.0.1:9098'],
  ] as const;
  for (const [id, message] of fixtures) {
    it(`recognizes the source-specific BFF signature: ${id}`, async () => {
      assert.deepStrictEqual(matches(await context([row(message)])), [id]);
    });
  }

  it('accepts duplicate-key evidence from purpose-process for the BFF CID', async () => {
    const ctx = await context(
      [row('BFF request failed', BFF_ALARM.podApp, 'a')],
      [{ cid: 'a', rows: [row(DUPLICATE, 'interop-be-purpose-process')] }],
    );
    assert.deepStrictEqual(matches(ctx), ['INTEROP_K8S_K8IBBFFE_PUR-PRO-DUP-EVE-STR-VER']);
  });

  it('does not attribute a duplicate-key failure to purpose-process from the BFF or a different service', async () => {
    assert.deepStrictEqual(matches(await context([row(DUPLICATE)])), []);
    const ctx = await context(
      [row('BFF request failed', BFF_ALARM.podApp, 'a')],
      [
        {
          cid: 'a',
          rows: [row('Request accepted', 'interop-be-purpose-process'), row(DUPLICATE, 'another-service')],
        },
      ],
    );
    assert.deepStrictEqual(matches(ctx), []);
  });

  it('correlates the BFF notification 401 with the expired token in the same CID', async () => {
    const ctx = await context(
      [row(UNREAD_401, BFF_ALARM.podApp, 'a')],
      [
        {
          cid: 'a',
          rows: [row(EXPIRED, 'interop-be-in-app-notification-manager')],
        },
      ],
    );
    assert.deepStrictEqual(matches(ctx), ['INTEROP_K8S_K8IBBFFE_BFF-TOK-EXP']);
  });

  it('does not assume every notification 401 is an expired token or combine different CIDs', async () => {
    assert.deepStrictEqual(matches(await context([row(UNREAD_401, BFF_ALARM.podApp, 'a')])), []);
    assert.deepStrictEqual(
      matches(
        await context(
          [row(UNREAD_401, BFF_ALARM.podApp, 'a')],
          [{ cid: 'b', rows: [row(EXPIRED, 'interop-be-in-app-notification-manager')] }],
        ),
      ),
      [],
    );
  });

  it('does not identify malformed JWTs and invalid signatures as public-key lookup errors', async () => {
    for (const message of [
      'Token verification failed: JsonWebTokenError: jwt malformed',
      'Token verification failed: JsonWebTokenError: invalid signature',
    ]) {
      assert.deepStrictEqual(matches(await context([row(message)])), []);
    }
  });

  it('requires the code and connection reset in the same BFF log row', async () => {
    assert.deepStrictEqual(
      matches(
        await context([
          row('errors: 008-9991, Unexpected error', BFF_ALARM.podApp, 'a'),
          row('read ECONNRESET', BFF_ALARM.podApp, 'b'),
        ]),
      ),
      [],
    );
  });

  it('does not infer a purpose-process failure from a separate mention, and lets its direct evidence replace an unattributed reset', async () => {
    assert.deepStrictEqual(matches(await context([row('calling purpose-process'), row('read ECONNRESET')])), []);
    const ctx = await context([row('errors: 008-9991, call to purpose-process failed: read ECONNRESET')]);
    assert.deepStrictEqual(matches(ctx), ['INTEROP_K8S_K8IBBFFE_PUR-PRO-UNA-ECO']);
  });

  it('recognizes the documented Selfcare users 504 only within one BFF request', async () => {
    const ctx = await context([row(USERS_504, BFF_ALARM.podApp, 'a')], [{ cid: 'a', rows: [row(USERS_WARN)] }]);
    assert.deepStrictEqual(matches(ctx), ['INTEROP_K8S_K8IBBFFE_BFF-SEL-USE-TIM']);
    assert.deepStrictEqual(
      matches(await context([row(USERS_504, BFF_ALARM.podApp, 'a')], [{ cid: 'b', rows: [row(USERS_WARN)] }])),
      [],
    );
    assert.deepStrictEqual(
      matches(
        await context(
          [row(USERS_WARN, BFF_ALARM.podApp, 'a')],
          [{ cid: 'a', rows: [row(USERS_504, 'another-service')] }],
        ),
      ),
      [],
    );
  });

  it('keeps the time of the BFF rows and the rows of the sequence that proves a request', async () => {
    const timed = (message: string, at: string): LogRows[number] => [
      ...row(message, BFF_ALARM.podApp, 'a'),
      { field: '@timestamp', value: at },
    ];
    const result = await new AnalyzeBffEvidenceStep().execute(
      conditionContext(
        [
          [
            BFF_ALARM.stepIds.queryApplicationLogs,
            [timed(USERS_504, '2026-10-06 00:40:00.000'), timed(USERS_WARN, '2026-10-06 00:38:00.000')],
          ],
          [BFF_ALARM.stepIds.queryCidTracker, []],
        ],
        'prod',
      ),
    );
    const request = result.output?.selfcareUsersTimeouts[0];
    assert.deepStrictEqual(
      request?.supportingRows.map(({ timestamp }) => timestamp),
      ['2026-10-06 00:38:00.000', '2026-10-06 00:40:00.000'],
    );
    const time = readEvidenceTime(request);
    assert.strictEqual(time?.first, Date.parse('2026-10-06T00:38:00.000Z'));
    assert.strictEqual(time?.last, Date.parse('2026-10-06T00:40:00.000Z'));
    assert.strictEqual(time?.weight, 2);
  });

  it('does not match another service error from the CID tracker or another connection port', async () => {
    const ctx = await context(
      [row('Unknown failure', BFF_ALARM.podApp, 'a')],
      [{ cid: 'a', rows: [row('Invalid character in header content ["Content-Disposition"]', 'another-service')] }],
    );
    assert.deepStrictEqual(matches(ctx), []);
    assert.deepStrictEqual(matches(await context([row('Connection error: connect ECONNREFUSED 10.0.0.1:443')])), []);
  });

  it('does not apply Prod-only cases to Attestazione or Test', async () => {
    for (const environment of ['att', 'test']) {
      assert.deepStrictEqual(matches(await context([row(EXPIRED)], [], environment)), []);
    }
  });

  it('recognizes the Selfcare users 500 in prod and the missing e-service document in test', async () => {
    const users500 =
      'ERROR -  [CID=72981aaf-9e1b-40f0-baa5-3ace6919c576][SelfcareV2ClientApi Institution Client][Error] GET https://api.selfcare.pagopa.it/external/v2/institutions/bcf7f5a8-8bcf-425e-8d59-cc7c2db678e5/users 500:Internal Server Error';
    const keyNotFound =
      'ERROR - Error getting file eservices/docs/0b3c1c2e-7d1a-4d2e-9a3f-1f2e3d4c5b6a/IT-Wallet-RC040-Tesserino-Venatorio.json in bucket interop-application-documents-test-es1: The specified key does not exist.';
    assert.deepStrictEqual(matches(await context([row(users500)])), ['INTEROP_K8S_K8IBBFFE_BFF-SEL-USE-500']);
    assert.deepStrictEqual(matches(await context([row(keyNotFound)], [], 'test')), [
      'INTEROP_K8S_K8IBBFFE_BFF-ESE-DOC-KEY-NOT-FOU',
    ]);
    assert.deepStrictEqual(matches(await context([row(users500.replace(' 500:', ' 504:'))])), []);
    assert.deepStrictEqual(matches(await context([row(keyNotFound)])), []);
  });
});
