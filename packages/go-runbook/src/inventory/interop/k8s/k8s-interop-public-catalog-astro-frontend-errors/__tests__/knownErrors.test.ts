import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { PUBLIC_CATALOG_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';

// Real log message: the quotes are already backslash-escaped in the log field.
const ENV_FILES_MESSAGE =
  '[dotenv-flow@4.1.0]: \\".env*\\" files loading failed: no \\".env*\\" files matching pattern ' +
  '\\".env[.node_env][.local]\\" in \\"/app/packages/astro-frontend\\" dir undefined';

/** Minimal realistic `@message` of every known error, from the operational PDF. */
const CASE_FIXTURES: ReadonlyArray<readonly [string, string]> = [
  ['INTEROP_K8S_K8IPCAFE_PUB-CAT-INV-UUI-SYN', '[ERROR] error: invalid input syntax for type uuid: "undefined"'],
  [
    'INTEROP_K8S_K8IPCAFE_PUB-CAT-UND-LEN-TYP-ERR',
    "[ERROR] TypeError: Cannot read properties of undefined (reading 'length') at processCatalog",
  ],
  ['INTEROP_K8S_K8IPCAFE_PUB-CAT-AST-FRO-MIS-ENV-FIL', ENV_FILES_MESSAGE],
  [
    'INTEROP_K8S_K8IPCAFE_PUB-CAT-REA-LIS-KEY-WAR',
    'Check the render method of `EServiceCatalog`. See https://react.dev/link/warning-keys for more information. ' +
      'Each child in a list should have a unique "key" prop.',
  ],
  [
    'INTEROP_K8S_K8IPCAFE_PUB-CAT-FAI-SQL-QUE',
    '[ERROR] Error: Failed query: select * from catalog_items at async executeQuery',
  ],
  [
    'INTEROP_K8S_K8IPCAFE_PUB-CAT-ERR-FET-FRO-DAT',
    'ERROR - [CID=dfa09b91-7acf-41ea-96c6-eb02ec18ec49] Error fetching catalog data from the database',
  ],
  ['INTEROP_K8S_K8IPCAFE_PUB-CAT-AST-NOD-COU-NOT-REN', '[ERROR] [@astrojs/node] Could not render /it/catalogo/servizi'],
];

function applicationMatches(message: string): ReadonlyArray<string> {
  return matchingKnownErrorCodes(
    KNOWN_ERRORS,
    conditionContext([[alarm.stepIds.queryApplicationLogs, podLogRows(alarm.podApp, [message])]]),
  );
}

describe('INTEROP public catalog known errors', () => {
  for (const [id, message] of CASE_FIXTURES) {
    it(`matches a realistic application-log fixture: ${id}`, () => {
      assert.deepStrictEqual(applicationMatches(message), [id]);
    });
  }

  it('matches the env-files message in CID tracker evidence with escaped or plain quotes', () => {
    for (const message of [ENV_FILES_MESSAGE, ENV_FILES_MESSAGE.replaceAll('\\"', '"')]) {
      const tracker = cidTrackerOutput(podLogRows(alarm.podApp, [message]));
      assert.deepStrictEqual(
        matchingKnownErrorCodes(KNOWN_ERRORS, conditionContext([[alarm.stepIds.queryCidTracker, tracker]])),
        ['INTEROP_K8S_K8IPCAFE_PUB-CAT-AST-FRO-MIS-ENV-FIL'],
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
      'INTEROP_K8S_K8IPCAFE_PUB-CAT-UND-LEN-TYP-ERR',
      'INTEROP_K8S_K8IPCAFE_PUB-CAT-ERR-FET-FRO-DAT',
    ]);
  });
});
