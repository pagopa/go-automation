import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { InteropPodLogScenario } from '../../../__tests__/helpers/InteropPodLogScenario.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../__tests__/helpers/runbookExecution.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { ONE_TRUST_NOTICES_ALARM as ALARM } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const SSL = 'Error: There was an error establishing an SSL connection';

async function run(scenario: Omit<InteropPodLogScenario, 'podApp'>): Promise<RunbookLogsExecution> {
  return executeAlarmWithLogs(
    buildRunbook(),
    ALARM.runbookKey,
    interopPodResponder({ podApp: ALARM.podApp, ...scenario }),
  );
}

describe('OneTrust notices known cases', () => {
  for (const [message, expected] of [
    ['AxiosError: Request failed with status code 503', 'one-trust-http-503'],
    ['AxiosError: Request failed with status code 502', 'one-trust-http-502'],
    ['AxiosError: Request failed with status code 500', 'one-trust-http-500'],
    [SSL, 'one-trust-ssl-connection'],
  ] as const) {
    it(`recognizes ${expected} in the production namespace without requiring a CID`, async () => {
      const { matchedIds, queries } = await run({ messages: [message] });
      assert.deepStrictEqual(matchedIds, [expected]);
      assert.match(queries[0]?.query ?? '', /pod_namespace = "prod" and pod_app = "interop-be-one-trust-notices"/u);
    });
  }

  it('does not classify another service’s tracker errors as a OneTrust case', async () => {
    const { matchedIds } = await run({
      messages: ['ERROR - Unknown OneTrust error'],
      cid: 'shared-cid',
      trackerMessages: [
        'AxiosError: Request failed with status code 503',
        'AxiosError: Request failed with status code 502',
        'AxiosError: Request failed with status code 500',
        SSL,
      ],
    });
    assert.deepStrictEqual(matchedIds, []);
  });

  it('keeps generic connection failures and other statuses unknown', async () => {
    for (const message of [
      'Error: Error while connecting to OneTrust',
      'AxiosError: Request failed with status code 504',
      'AxiosError: Request failed with status code 5030',
      'AccessDenied',
    ]) {
      assert.deepStrictEqual((await run({ messages: [message] })).matchedIds, [], message);
    }
  });
});
