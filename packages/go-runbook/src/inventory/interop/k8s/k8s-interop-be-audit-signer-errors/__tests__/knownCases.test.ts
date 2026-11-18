import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { InteropPodLogScenario } from '../../../shared/__tests__/helpers/InteropPodLogScenario.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { AUDIT_SIGNER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const UPLOAD_ERROR =
  'ERROR - Error processing message: Error: Error uploading file content on safe storage, details: AxiosError: Request failed with status code ';
const CREATE_TIMEOUT =
  'ERROR - Error processing message: Error: Error creating file on safe storage, details: AxiosError: timeout of 30000ms exceeded';

async function run(
  environment: string,
  scenario: Omit<InteropPodLogScenario, 'podApp'>,
): Promise<RunbookLogsExecution> {
  return executeAlarmWithLogs(
    buildRunbook(),
    `${alarm.runbookKey}-${environment}`,
    interopPodResponder({ podApp: alarm.podApp, ...scenario }),
  );
}

describe('audit signer known cases', () => {
  for (const [message, expected] of [
    [`${UPLOAD_ERROR}500`, 'audit-signer-safe-storage-upload-500-503'],
    [`${UPLOAD_ERROR}503`, 'audit-signer-safe-storage-upload-500-503'],
    [CREATE_TIMEOUT, 'audit-signer-safe-storage-create-timeout'],
  ] as const) {
    it(`recognizes ${expected} without CID only in prod: ${message.slice(-25)}`, async () => {
      assert.deepStrictEqual((await run('prod', { messages: [message] })).matchedIds, [expected]);
      for (const environment of ['att', 'test']) {
        assert.deepStrictEqual((await run(environment, { messages: [message] })).matchedIds, []);
      }
    });
  }

  it('does not treat a correlated retry success as recovery of the upload', async () => {
    const { matchedIds } = await run('prod', {
      messages: [`${UPLOAD_ERROR}500`],
      cid: 'audit-cid',
      trackerMessages: ['INFO - Retry successful'],
    });
    assert.deepStrictEqual(matchedIds, ['audit-signer-safe-storage-upload-500-503']);
  });

  it('does not attribute another service’s tracker error to the signer', async () => {
    const { matchedIds } = await run('prod', {
      messages: ['ERROR - Unknown signer error'],
      cid: 'audit-cid',
      trackerMessages: [`${UPLOAD_ERROR}500`],
    });
    assert.deepStrictEqual(matchedIds, []);
  });

  it('keeps unrelated HTTP codes, other operations and other timeout durations unclassified', async () => {
    for (const message of [
      `${UPLOAD_ERROR}403`,
      `${UPLOAD_ERROR}5000`,
      CREATE_TIMEOUT.replace('30000ms', '60000ms'),
      `${UPLOAD_ERROR}500`.replace('uploading file content', 'creating file'),
    ]) {
      assert.deepStrictEqual((await run('prod', { messages: [message] })).matchedIds, [], message);
    }
  });
});
