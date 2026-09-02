import { PUBLIC_CATALOG_ALARM } from '../alarmDefinition.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KNOWN_CASES } from '../knownCases.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator, type KnownCase, type RunbookContext } from '../../framework.js';

interface LogRowField {
  readonly field: string;
  readonly value: string;
}

/** Builds rows in the same shape produced by QueryInteropK8sApplicationLogsStep. */
function applicationLogRows(messages: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<LogRowField>> {
  return messages.map((message) => [
    { field: '@timestamp', value: '2026-07-10 13:00:00.000' },
    { field: 'pod_app', value: 'interop-public-catalog-astro-frontend' },
    { field: '@message', value: message },
  ]);
}

/** Builds results in the same shape produced by QueryInteropK8sCidTrackerStep. */
function cidTrackerResults(messages: ReadonlyArray<string>): ReadonlyArray<{
  readonly cid: string;
  readonly rows: ReadonlyArray<ReadonlyArray<LogRowField>>;
}> {
  return [{ cid: 'dfa09b91-7acf-41ea-96c6-eb02ec18ec49', rows: applicationLogRows(messages) }];
}

function context(stepResults: ReadonlyArray<readonly [string, unknown]>): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-07-10T13:00:00.000Z'),
    stepResults: new Map<string, unknown>(stepResults),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function knownCaseById(id: string): KnownCase {
  const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined, `known case not found: ${id}`);
  return knownCase;
}

// Real log message: the quotes are already backslash-escaped in the log field.
const M2M_ENV_FILES_MESSAGE =
  '[dotenv-flow@4.1.0]: \\".env*\\" files loading failed: no \\".env*\\" files matching pattern ' +
  '\\".env[.node_env][.local]\\" in \\"/app/packages/astro-frontend\\" dir undefined';

/** Minimal realistic `@message` fixture for every known case, from the operational PDF. */
const CASE_FIXTURES: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  ['public-catalog-invalid-uuid-syntax', ['[ERROR] error: invalid input syntax for type uuid: "undefined"']],
  [
    'public-catalog-undefined-length-type-error',
    ["[ERROR] TypeError: Cannot read properties of undefined (reading 'length') at processCatalog"],
  ],
  ['public-catalog-astro-frontend-missing-env-files', [M2M_ENV_FILES_MESSAGE]],
  [
    'public-catalog-react-list-key-warning',
    [
      'Check the render method of `EServiceCatalog`. See https://react.dev/link/warning-keys for more information. ' +
        'Each child in a list should have a unique "key" prop.',
    ],
  ],
  [
    'public-catalog-failed-sql-query',
    ['[ERROR] Error: Failed query: select * from catalog_items at async executeQuery'],
  ],
  [
    'public-catalog-error-fetching-from-database',
    ['ERROR - [CID=dfa09b91-7acf-41ea-96c6-eb02ec18ec49] Error fetching catalog data from the database'],
  ],
  ['public-catalog-astro-node-could-not-render', ['[ERROR] [@astrojs/node] Could not render /it/catalogo/servizi']],
]);

describe('INTEROP public catalog known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('has unique IDs and priorities', () => {
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.id)).size, KNOWN_CASES.length);
    assert.strictEqual(new Set(KNOWN_CASES.map((knownCase) => knownCase.priority)).size, KNOWN_CASES.length);
    assert.deepStrictEqual(KNOWN_CASES.map((knownCase) => knownCase.id).sort(), [...CASE_FIXTURES.keys()].sort());
  });

  it('covers the Astro node render failure added to the updated operational PDF', () => {
    const renderFailure = knownCaseById('public-catalog-astro-node-could-not-render');
    const fixture = CASE_FIXTURES.get(renderFailure.id);
    assert.ok(fixture !== undefined);

    const ctx = context([[PUBLIC_CATALOG_ALARM.stepIds.queryApplicationLogs, applicationLogRows(fixture)]]);
    assert.strictEqual(evaluator.evaluate(renderFailure.condition, ctx), true);
    assert.strictEqual(renderFailure.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.deepStrictEqual(
      renderFailure.analysis?.links?.map((link) => link.url),
      [
        'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1783954003529819',
        'https://pagopaspa.slack.com/archives/C0A7F9XQAT0/p1784026375370299?thread_ts=1784014737.320699&cid=C0A7F9XQAT0',
      ],
    );
  });

  it('matches every known case against a realistic application-log fixture', () => {
    for (const knownCase of KNOWN_CASES) {
      const fixture = CASE_FIXTURES.get(knownCase.id);
      assert.ok(fixture !== undefined, `missing fixture for known case: ${knownCase.id}`);

      const ctx = context([[PUBLIC_CATALOG_ALARM.stepIds.queryApplicationLogs, applicationLogRows(fixture)]]);
      assert.strictEqual(evaluator.evaluate(knownCase.condition, ctx), true, `expected match: ${knownCase.id}`);
    }
  });

  it('matches escaped-quote messages in CID tracker evidence too', () => {
    const envFiles = knownCaseById('public-catalog-astro-frontend-missing-env-files');
    const ctx = context([[PUBLIC_CATALOG_ALARM.stepIds.queryCidTracker, cidTrackerResults([M2M_ENV_FILES_MESSAGE])]]);
    assert.strictEqual(evaluator.evaluate(envFiles.condition, ctx), true);

    const plainQuotesMessage = M2M_ENV_FILES_MESSAGE.replaceAll('\\"', '"');
    const plainCtx = context([[PUBLIC_CATALOG_ALARM.stepIds.queryCidTracker, cidTrackerResults([plainQuotesMessage])]]);
    assert.strictEqual(evaluator.evaluate(envFiles.condition, plainCtx), true);
  });

  it('ranks the specific TypeError case above the generic database fetch case when both match', () => {
    const typeError = knownCaseById('public-catalog-undefined-length-type-error');
    const fetchError = knownCaseById('public-catalog-error-fetching-from-database');

    // Combined message observed in production (PIN-8718 / PIN-8836).
    const ctx = context([
      [
        PUBLIC_CATALOG_ALARM.stepIds.queryApplicationLogs,
        applicationLogRows([
          "[ERROR] TypeError: Cannot read properties of undefined (reading 'length') at ... " +
            'ERROR - [CID=dfa09b91-7acf-41ea-96c6-eb02ec18ec49] Error fetching tenants from the database',
        ]),
      ],
    ]);

    assert.strictEqual(evaluator.evaluate(typeError.condition, ctx), true);
    assert.strictEqual(evaluator.evaluate(fetchError.condition, ctx), true);
    assert.ok(typeError.priority > fetchError.priority);
  });

  it('keeps cases requiring operator confirmation open', () => {
    const reactWarning = knownCaseById('public-catalog-react-list-key-warning');
    const missingEnvFiles = knownCaseById('public-catalog-astro-frontend-missing-env-files');

    assert.strictEqual(reactWarning.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.match(reactWarning.analysis?.resolution ?? '', /Status: 200/);
    assert.strictEqual(missingEnvFiles.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.match(missingEnvFiles.analysis?.resolution ?? '', /non una risoluzione per questa pod_app/);
  });
});
