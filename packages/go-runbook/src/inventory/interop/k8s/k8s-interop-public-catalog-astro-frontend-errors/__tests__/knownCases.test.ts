import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../__tests__/helpers/knownCaseTesting.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { PUBLIC_CATALOG_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';

// Real log message: the quotes are already backslash-escaped in the log field.
const ENV_FILES_MESSAGE =
  '[dotenv-flow@4.1.0]: \\".env*\\" files loading failed: no \\".env*\\" files matching pattern ' +
  '\\".env[.node_env][.local]\\" in \\"/app/packages/astro-frontend\\" dir undefined';

/** Minimal realistic `@message` of every known case, from the operational PDF. */
const CASE_FIXTURES: ReadonlyArray<readonly [string, string]> = [
  ['public-catalog-invalid-uuid-syntax', '[ERROR] error: invalid input syntax for type uuid: "undefined"'],
  [
    'public-catalog-undefined-length-type-error',
    "[ERROR] TypeError: Cannot read properties of undefined (reading 'length') at processCatalog",
  ],
  ['public-catalog-astro-frontend-missing-env-files', ENV_FILES_MESSAGE],
  [
    'public-catalog-react-list-key-warning',
    'Check the render method of `EServiceCatalog`. See https://react.dev/link/warning-keys for more information. ' +
      'Each child in a list should have a unique "key" prop.',
  ],
  ['public-catalog-failed-sql-query', '[ERROR] Error: Failed query: select * from catalog_items at async executeQuery'],
  [
    'public-catalog-error-fetching-from-database',
    'ERROR - [CID=dfa09b91-7acf-41ea-96c6-eb02ec18ec49] Error fetching catalog data from the database',
  ],
  ['public-catalog-astro-node-could-not-render', '[ERROR] [@astrojs/node] Could not render /it/catalogo/servizi'],
];

function applicationMatches(message: string): ReadonlyArray<string> {
  return matchingCaseIds(
    KNOWN_CASES,
    conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, [message])]]),
  );
}

describe('INTEROP public catalog known cases', () => {
  for (const [id, message] of CASE_FIXTURES) {
    it(`matches a realistic application-log fixture: ${id}`, () => {
      assert.deepStrictEqual(applicationMatches(message), [id]);
    });
  }

  it('matches the env-files message in CID tracker evidence with escaped or plain quotes', () => {
    for (const message of [ENV_FILES_MESSAGE, ENV_FILES_MESSAGE.replaceAll('\\"', '"')]) {
      const tracker = cidTrackerOutput(podLogRows(alarm.podApp, [message]));
      assert.deepStrictEqual(
        matchingCaseIds(KNOWN_CASES, conditionContext([[alarm.stepIds.queryCidTracker, tracker]])),
        ['public-catalog-astro-frontend-missing-env-files'],
      );
    }
  });

  it('ranks the specific TypeError case above the generic database fetch case when both match', () => {
    // Combined message observed in production.
    const ids = applicationMatches(
      "[ERROR] TypeError: Cannot read properties of undefined (reading 'length') at ... " +
        'ERROR - [CID=dfa09b91-7acf-41ea-96c6-eb02ec18ec49] Error fetching tenants from the database',
    );
    assert.deepStrictEqual(ids, [
      'public-catalog-undefined-length-type-error',
      'public-catalog-error-fetching-from-database',
    ]);
  });
});
