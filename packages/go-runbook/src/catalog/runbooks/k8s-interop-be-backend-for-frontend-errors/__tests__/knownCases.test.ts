import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BFF_ALARM } from '../alarmDefinition.js';
import { AnalyzeBffEvidenceStep, BFF_EVIDENCE_STEP_ID } from '../AnalyzeBffEvidenceStep.js';
import { KNOWN_CASES } from '../knownCases.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator, INTEROP_DOWNSTREAMS, type KnownCase, type RunbookContext } from '../../framework.js';
import type { ResultField } from '@go-automation/go-common/aws';

const DUPLICATE =
  'errors: 004-9991, Error creating event: error: duplicate key value violates unique constraint "events_stream_id_version_key"';
const EXPIRED = 'Token verification failed: TokenExpiredError: jwt expired';
const UNREAD_401 = 'Error while fetching unread notifications: AxiosError: Request failed with status code 401';
const USERS_WARN = 'Error while retrieving users corresponding to tenant tenant-1';
const USERS_504 =
  'errors: 008-9991, Unexpected error - original error: AxiosError: Request failed with status code 504';

function row(message: string, podApp = BFF_ALARM.podApp, cid?: string): ReadonlyArray<ResultField> {
  return [
    { field: 'pod_app', value: podApp },
    { field: 'log', value: message },
    ...(cid === undefined ? [] : [{ field: 'cid', value: cid }]),
  ];
}

async function context(
  application: ReadonlyArray<ReadonlyArray<ResultField>>,
  tracker: ReadonlyArray<{ readonly cid: string; readonly rows: ReadonlyArray<ReadonlyArray<ResultField>> }> = [],
  environment = 'prod',
): Promise<RunbookContext> {
  const stepResults = new Map<string, unknown>([
    [BFF_ALARM.stepIds.queryApplicationLogs, application],
    [BFF_ALARM.stepIds.queryCidTracker, tracker],
  ]);
  const ctx: RunbookContext = {
    executionId: 'test',
    startedAt: new Date('2026-10-26T13:26:05.000Z'),
    stepResults,
    vars: new Map([['interopEnvironment', environment]]),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
  const result = await new AnalyzeBffEvidenceStep().execute(ctx);
  assert.strictEqual(result.success, true);
  stepResults.set(BFF_EVIDENCE_STEP_ID, result.output);
  return ctx;
}

function knownCaseById(id: string): KnownCase {
  const candidate = KNOWN_CASES.find((candidate) => candidate.id === id);
  assert.ok(candidate !== undefined, id);
  return candidate;
}

const evaluator = new ConditionEvaluator();
const matches = (ctx: RunbookContext): ReadonlyArray<string> =>
  KNOWN_CASES.filter((candidate) => evaluator.evaluate(candidate.condition, ctx)).map(({ id }) => id);

describe('INTEROP BFF known cases', () => {
  it('has unique IDs and priorities, with unresolved cases preceding the documented no-action case', () => {
    assert.strictEqual(new Set(KNOWN_CASES.map(({ id }) => id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map(({ priority }) => priority)).size, KNOWN_CASES.length);
    const completed = KNOWN_CASES.filter(({ analysis }) => analysis?.proposedStatus === 'COMPLETED');
    assert.deepStrictEqual(
      completed.map(({ id }) => id),
      ['purpose-process-duplicate-event-stream-version'],
    );
    assert.ok(
      KNOWN_CASES.filter(({ analysis }) => analysis?.proposedStatus === 'IN_PROGRESS').every(
        ({ priority }) => priority > knownCaseById('purpose-process-duplicate-event-stream-version').priority,
      ),
    );
    for (const candidate of KNOWN_CASES) assert.deepStrictEqual(candidate.analysis?.finalActions, []);
  });

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

  it('accepts duplicate-key evidence from purpose-process for the BFF CID, preserving its no-action resolution', async () => {
    const ctx = await context(
      [row('BFF request failed', BFF_ALARM.podApp, 'a')],
      [{ cid: 'a', rows: [row(DUPLICATE, 'interop-be-purpose-process')] }],
    );
    assert.deepStrictEqual(matches(ctx), ['purpose-process-duplicate-event-stream-version']);
    assert.match(
      knownCaseById('purpose-process-duplicate-event-stream-version').analysis?.resolution ?? '',
      /Nessuna azione necessaria.*retry/u,
    );
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

  it('correlates the BFF notification 401 with the expired token in the same CID without auto-completion', async () => {
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
    assert.strictEqual(knownCaseById('bff-token-expired').analysis?.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(knownCaseById('bff-token-expired').analysis?.resolution, 'Risoluzione non documentata.');
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
    assert.strictEqual(knownCaseById('bff-agreement-api-econnreset').analysis?.proposedStatus, 'IN_PROGRESS');
    assert.match(knownCaseById('bff-agreement-api-econnreset').analysis?.resolution ?? '', /Da verificare/u);
  });

  it('does not infer a purpose-process failure from a separate mention and ranks its direct evidence above an unattributed reset', async () => {
    assert.deepStrictEqual(matches(await context([row('calling purpose-process'), row('read ECONNRESET')])), []);
    const ctx = await context([row('errors: 008-9991, call to purpose-process failed: read ECONNRESET')]);
    assert.ok(matches(ctx).includes('purpose-process-unavailable-econnreset'));
    assert.ok(
      knownCaseById('purpose-process-unavailable-econnreset').priority >
        knownCaseById('bff-agreement-api-econnreset').priority,
    );
  });

  it('recognizes the documented Selfcare users 504 only within one BFF request', async () => {
    const ctx = await context([row(USERS_504, BFF_ALARM.podApp, 'a')], [{ cid: 'a', rows: [row(USERS_WARN)] }]);
    assert.deepStrictEqual(matches(ctx), ['bff-selfcare-users-timeout']);
    assert.deepStrictEqual(knownCaseById('bff-selfcare-users-timeout').analysis?.downstreams, [
      INTEROP_DOWNSTREAMS.SELFCARE,
    ]);
    assert.strictEqual(
      knownCaseById('bff-selfcare-users-timeout').analysis?.resolution,
      'Risoluzione non documentata.',
    );
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
