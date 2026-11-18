import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../__tests__/helpers/knownCaseTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../__tests__/helpers/runbookExecution.js';
import { matchingCaseIds } from '../../../../../__tests__/helpers/knownCaseMatching.js';
import { PUBLIC_CATALOG_STRAPI_ALARM as alarm } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { buildRunbook } from '../runbook.js';

const RESET = 'public-catalog-strapi-connection-reset';
const SALT_WARNING = 'public-catalog-strapi-transfer-token-salt-warning';
const STARTUP = 'public-catalog-strapi-startup-stderr';

const FIXTURES: ReadonlyArray<readonly [string, string]> = [
  [RESET, '  Error: read ECONNRESET'],
  [SALT_WARNING, '(node:31) Warning: Missing transfer.token.salt: Data transfer features have been disabled.'],
  [STARTUP, '! Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-9.15.9.tgz'],
  [STARTUP, '[baseline-browser-mapping] The data in this module is over two months old.'],
];

describe('INTEROP public catalog Strapi known cases', () => {
  it('recognizes production signatures only in Strapi evidence, not in other CID-tracker services', () => {
    for (const [id, message] of FIXTURES) {
      const rows = podLogRows(alarm.podApp, [message]);
      for (const environment of ['prod', 'att']) {
        const context = conditionContext([[alarm.stepIds.queryApplicationLogs, rows]], environment);
        assert.deepStrictEqual(matchingCaseIds(KNOWN_CASES, context), environment === 'prod' ? [id] : [], message);
      }
      const tracker = cidTrackerOutput(podLogRows('interop-public-catalog-astro-frontend', [message]));
      assert.deepStrictEqual(
        matchingCaseIds(KNOWN_CASES, conditionContext([[alarm.stepIds.queryCidTracker, tracker]])),
        [],
      );
    }
  });

  it('resolves the most relevant case of an execution without CID, after collecting the pod context', async () => {
    for (const [messages, expected] of [
      [FIXTURES.map(([, message]) => message), RESET],
      [[FIXTURES[1]?.[1] ?? ''], SALT_WARNING],
      [[FIXTURES[2]?.[1] ?? ''], STARTUP],
    ] as const) {
      const { matchedIds, queries } = await executeAlarmWithLogs(
        buildRunbook(),
        `${alarm.runbookKey}-prod-public-catalog`,
        interopPodResponder({
          podApp: alarm.podApp,
          messages,
          contextMessages: ['> strapi start', 'HTTP GET /admin/register-admin 200', ...messages],
        }),
      );
      assert.strictEqual(matchedIds[0], expected);
      // Application logs and pod context: the CID tracker is skipped without a CID.
      assert.strictEqual(queries.length, 2);
    }
  });
});
