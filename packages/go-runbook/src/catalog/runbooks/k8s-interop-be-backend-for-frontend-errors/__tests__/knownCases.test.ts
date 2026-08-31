import { BFF_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConditionEvaluator, type KnownCase, type RunbookContext, type ServiceRegistry } from '../../framework.js';

import { KNOWN_CASES } from '../knownCases.js';

interface LogRowField {
  readonly field: string;
  readonly value: string;
}

/** Builds rows in the same shape produced by QueryInteropK8sApplicationLogsStep. */
function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-07-09 10:00:00.000' },
    { field: 'pod_app', value: 'interop-be-backend-for-frontend' },
    { field: '@message', value: message },
  ]);
}

/** Builds results in the same shape produced by QueryInteropK8sCidTrackerStep. */
function cidTrackerResults(messages: ReadonlyArray<string>): ReadonlyArray<{
  readonly cid: string;
  readonly rows: ReadonlyArray<ReadonlyArray<LogRowField>>;
}> {
  return [{ cid: 'cid-1', rows: applicationLogRows(messages) }];
}

function context(stepResults: ReadonlyArray<readonly [string, unknown]>): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-07-09T10:00:00.000Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

function knownCaseById(id: string): KnownCase {
  const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined, `known case not found: ${id}`);
  return knownCase;
}

/** Minimal realistic `@message` fixture for every known case. */
const CASE_FIXTURES: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  [
    'purpose-process-duplicate-event-stream-version',
    ['ERROR: duplicate key value violates unique constraint "events_stream_id_version_key"'],
  ],
  [
    'bff-invalid-content-disposition-header',
    ['TypeError: Invalid character in header content ["Content-Disposition"]'],
  ],
  ['bff-adm-zip-invalid-format', ['ADM-ZIP: Invalid or unsupported zip format. No END header found']],
  ['bff-token-expired', ['Token verification failed: TokenExpiredError: jwt expired']],
  ['bff-error-getting-public-key', ['Error getting public key for kid 1234']],
  ['bff-agreement-api-econnreset', ['errors: 008-9991, Unexpected error while calling agreement API: read ECONNRESET']],
  ['purpose-process-unavailable-econnreset', ['call to purpose-process failed: socket hang up']],
  ['bff-tenant-kind-not-found', ['errors: 004-0004, Tenant kind PA not found']],
]);

describe('INTEROP BFF known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('has unique IDs and priorities', () => {
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.priority)).size, KNOWN_CASES.length);
  });

  it('matches every known case against a realistic application-log fixture', () => {
    for (const knownCase of KNOWN_CASES) {
      const fixture = CASE_FIXTURES.get(knownCase.id);
      assert.ok(fixture !== undefined, `missing fixture for known case: ${knownCase.id}`);

      const ctx = context([[BFF_ALARM.stepIds.queryApplicationLogs, applicationLogRows(fixture)]]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true, `expected match: ${knownCase.id}`);
    }
  });

  it('matches quoted patterns in CID tracker evidence too', () => {
    const duplicate = knownCaseById('purpose-process-duplicate-event-stream-version');
    const ctx = context([
      [
        BFF_ALARM.stepIds.queryCidTracker,
        cidTrackerResults(['duplicate key value violates unique constraint "events_stream_id_version_key"']),
      ],
    ]);
    assert.strictEqual(evaluator.evaluate(duplicate.condition, ctx), true);
  });

  it('matches token expired before the generic public key case', () => {
    const expired = knownCaseById('bff-token-expired');
    const publicKey = knownCaseById('bff-error-getting-public-key');
    assert.ok(expired.priority > publicKey.priority);

    const ctx = context([
      [
        BFF_ALARM.stepIds.queryApplicationLogs,
        applicationLogRows(['Token verification failed: TokenExpiredError: jwt expired']),
      ],
    ]);
    assert.strictEqual(evaluator.evaluate(expired.condition, ctx), true);
    assert.strictEqual(evaluator.evaluate(publicKey.condition, ctx), false);
  });

  it('ranks ECONNRESET cases below more specific patterns when both match', () => {
    const admZip = knownCaseById('bff-adm-zip-invalid-format');
    const agreement = knownCaseById('bff-agreement-api-econnreset');
    const purposeProcess = knownCaseById('purpose-process-unavailable-econnreset');

    const ctx = context([
      [
        BFF_ALARM.stepIds.queryApplicationLogs,
        applicationLogRows([
          'ADM-ZIP: Invalid or unsupported zip format. No END header found',
          'errors: 008-9991, Unexpected error while calling agreement API: read ECONNRESET',
          'call to purpose-process failed: read ECONNRESET',
        ]),
      ],
    ]);

    assert.strictEqual(evaluator.evaluate(admZip.condition, ctx), true);
    assert.strictEqual(evaluator.evaluate(agreement.condition, ctx), true);
    assert.strictEqual(evaluator.evaluate(purposeProcess.condition, ctx), true);
    assert.ok(admZip.priority > agreement.priority);
    assert.ok(agreement.priority > purposeProcess.priority);
  });
});
