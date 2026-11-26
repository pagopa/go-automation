import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { InteropPodLogScenario } from '../../../shared/__tests__/helpers/InteropPodLogScenario.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import type { RunbookLogsExecution } from '../../../../../__tests__/helpers/RunbookLogsExecution.js';
import { M2M_AUDIT_SIGNER_ALARM as alarm } from '../alarmDefinition.js';
import { buildRunbook } from '../runbook.js';

const UPLOAD_CASE_ID = 'm2m-audit-signer-safe-storage-upload-500-503';
const TIMEOUT_CASE_ID = 'm2m-audit-signer-safe-storage-create-timeout';
const CREATE_500_CASE_ID = 'm2m-audit-signer-safe-storage-create-500';
const UPLOAD_ERROR =
  'ERROR [audit-signer] - Error processing message: Error: Error uploading file content on safe storage, details: AxiosError: Request failed with status code ';
const CREATE_TIMEOUT =
  'ERROR [audit-signer] - [CID=] Error processing message: Error: Error creating file on safe storage, details: AxiosError: timeout of 30000ms exceeded';
const CREATE_500 =
  'ERROR [audit-signer] - [CID=] Error processing message: Error: Error creating file on safe storage, details: AxiosError: Request failed with status code 500';

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

describe('m2m audit signer known cases', () => {
  it('recognizes the upload error with HTTP 500 or 503 in prod and test only', async () => {
    for (const code of ['500', '503']) {
      for (const environment of ['prod', 'test']) {
        const { matchedIds } = await run(environment, { messages: [`${UPLOAD_ERROR}${code}`] });
        assert.deepStrictEqual(matchedIds, [UPLOAD_CASE_ID], `${environment} ${code}`);
      }
      assert.deepStrictEqual((await run('att', { messages: [`${UPLOAD_ERROR}${code}`] })).matchedIds, []);
    }
  });

  it('recognizes the creation timeout, also without the processing prefix, in test only', async () => {
    const withoutPrefix =
      'ERROR [audit-signer] -  Error: Error creating file on safe storage, details: AxiosError: timeout of 30000ms exceeded';
    for (const message of [CREATE_TIMEOUT, withoutPrefix]) {
      assert.deepStrictEqual((await run('test', { messages: [message] })).matchedIds, [TIMEOUT_CASE_ID], message);
      for (const environment of ['prod', 'att']) {
        assert.deepStrictEqual((await run(environment, { messages: [message] })).matchedIds, [], environment);
      }
    }
  });

  it('recognizes the creation error with HTTP 500 in test only', async () => {
    assert.deepStrictEqual((await run('test', { messages: [CREATE_500] })).matchedIds, [CREATE_500_CASE_ID]);
    for (const environment of ['prod', 'att']) {
      assert.deepStrictEqual((await run(environment, { messages: [CREATE_500] })).matchedIds, [], environment);
    }
  });

  it('does not treat a correlated retry success as recovery of the upload', async () => {
    const { matchedIds } = await run('prod', {
      messages: [`${UPLOAD_ERROR}503`],
      cid: 'm2m-audit-cid',
      trackerMessages: ['INFO - Retry successful'],
    });
    assert.deepStrictEqual(matchedIds, [UPLOAD_CASE_ID]);
  });

  it('does not attribute another service’s tracker error to the signer', async () => {
    const { matchedIds } = await run('test', {
      messages: ['ERROR - Unknown signer error'],
      cid: 'm2m-audit-cid',
      trackerMessages: [CREATE_TIMEOUT],
    });
    assert.deepStrictEqual(matchedIds, []);
  });

  it('keeps unrelated HTTP codes, other operations and other timeout durations unclassified', async () => {
    for (const message of [
      `${UPLOAD_ERROR}403`,
      `${UPLOAD_ERROR}5000`,
      CREATE_500.replace('code 500', 'code 503'),
      CREATE_500.replace('code 500', 'code 5000'),
      CREATE_TIMEOUT.replace('30000ms', '60000ms'),
    ]) {
      assert.deepStrictEqual((await run('test', { messages: [message] })).matchedIds, [], message);
    }
  });
});
