import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BFF_ALARM } from '../alarmDefinition.js';
import { AnalyzeBffEvidenceStep, BFF_EVIDENCE_STEP_ID } from '../AnalyzeBffEvidenceStep.js';
import { KNOWN_CASES } from '../knownCases.js';
import type { RunbookContext } from '../../../../../engine/index.js';
import { cidTrackerOutput, conditionContext } from '../../../shared/__tests__/helpers/knownCaseTesting.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import type { LogRows } from '../../../../../__tests__/helpers/LogRows.js';

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

const matches = (ctx: RunbookContext): ReadonlyArray<string> => matchingCaseIds(KNOWN_CASES, ctx);

describe('INTEROP BFF known cases', () => {
  const fixtures = [
    [
      'bff-invalid-content-disposition-header',
      'TypeError: Invalid character in header content ["Content-Disposition"]',
    ],
    ['bff-adm-zip-invalid-format', 'ADM-ZIP: Invalid or unsupported zip format. No END header found'],
    ['bff-token-expired', EXPIRED],
    ['bff-error-getting-public-key', 'Error getting public key'],
    [
      'bff-error-getting-public-key',
      'Token verification failed: JsonWebTokenError: error in secret or public key callback: Error getting signing key',
    ],
    ['bff-agreement-api-econnreset', 'errors: 008-9991, Unexpected error: read ECONNRESET'],
    ['purpose-process-unavailable-econnreset', 'call to purpose-process failed: socket hang up'],
    ['bff-tenant-kind-not-found', 'errors: 004-0004, Tenant kind for tenant tenant-1 not found'],
    ['bff-connection-refused-9098', 'Connection error: connect ECONNREFUSED 10.0.0.1:9098'],
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
    assert.deepStrictEqual(matches(ctx), ['purpose-process-duplicate-event-stream-version']);
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
    assert.deepStrictEqual(matches(ctx), ['bff-token-expired']);
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

  it('does not infer a purpose-process failure from a separate mention and ranks its direct evidence above an unattributed reset', async () => {
    assert.deepStrictEqual(matches(await context([row('calling purpose-process'), row('read ECONNRESET')])), []);
    const ctx = await context([row('errors: 008-9991, call to purpose-process failed: read ECONNRESET')]);
    assert.strictEqual(matches(ctx)[0], 'purpose-process-unavailable-econnreset');
  });

  it('recognizes the documented Selfcare users 504 only within one BFF request', async () => {
    const ctx = await context([row(USERS_504, BFF_ALARM.podApp, 'a')], [{ cid: 'a', rows: [row(USERS_WARN)] }]);
    assert.deepStrictEqual(matches(ctx), ['bff-selfcare-users-timeout']);
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
});
