import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cidTrackerOutput, conditionContext, podLogRows } from '../../../shared/__tests__/helpers/knownErrorTesting.js';
import { executeAlarmWithLogs, interopPodResponder } from '../../../shared/__tests__/helpers/runbookExecution.js';
import { matchingKnownErrorCodes } from '../../../../../__tests__/helpers/knownErrorMatching.js';
import { SIGNED_OBJECTS_PERSISTER_ALARM as ALARM } from '../alarmDefinition.js';
import { KNOWN_ERRORS } from '../knownErrors.js';
import { buildRunbook } from '../runbook.js';

const PARSE_ERROR =
  "Error processing message: Error: Error reading signature reference with id='file.gz' from table 'interop-safe-storage-signature-tracking-prod': Error: Unable to parse signature reference for id='file.gz'";
const TIMEOUT =
  'Error processing message: Error: Error getting file content on safe storage, details: AxiosError: timeout of 30000ms exceeded';

function queueError(status: number, operation: string, queue = 'interop-safe-storage-completed-tasks-prod'): string {
  return `Generic error occurs processing Queue: https://sqs.example/${queue}. Details: AxiosError: Request failed with status code ${String(status)}\n    at async ${operation} (metadata.js:14:5)`;
}

function matches(
  messages: ReadonlyArray<string>,
  environment = 'prod',
  stepId = ALARM.stepIds.queryApplicationLogs,
): ReadonlyArray<string> {
  const rows = podLogRows(ALARM.podApp, messages);
  const output = stepId === ALARM.stepIds.queryCidTracker ? cidTrackerOutput(rows) : rows;
  return matchingKnownErrorCodes(KNOWN_ERRORS, conditionContext([[stepId, output]], environment));
}

describe('Signed objects persister known errors', () => {
  for (const [id, message] of [
    ['INTEROP_K8S_K8IBSOPEP_SIG-OBJ-SIG-REF-PAR-ERR', PARSE_ERROR],
    ['INTEROP_K8S_K8IBSOPEP_SIG-OBJ-PUR-RIS-ANA-HTT-500', queueError(500, 'addPurposeRiskAnalysisSignedDocument')],
    ['INTEROP_K8S_K8IBSOPEP_SIG-OBJ-SAF-STO-FIL-TIM', TIMEOUT],
    ['INTEROP_K8S_K8IBSOPEP_SIG-OBJ-AGR-SIG-CON-HTT-409', queueError(409, 'addAgreementSignedContract')],
  ] as const) {
    it(`recognizes the documented signature in raw and structured prod logs only: ${id}`, () => {
      assert.deepStrictEqual(matches([message]), [id]);
      assert.deepStrictEqual(matches([JSON.stringify({ log: message, pod_app: ALARM.podApp })]), [id]);
      for (const environment of ['att', 'test', 'dev']) assert.deepStrictEqual(matches([message], environment), []);
    });
  }

  it('accepts the source timeout with the last character truncated', () => {
    assert.deepStrictEqual(matches([TIMEOUT.slice(0, -1)]), ['INTEROP_K8S_K8IBSOPEP_SIG-OBJ-SAF-STO-FIL-TIM']);
  });

  it('requires the operation and status in the same queue error row', () => {
    for (const messages of [
      [queueError(409, 'addPurposeRiskAnalysisSignedDocument')],
      [queueError(500, 'addAgreementSignedContract')],
      [queueError(409, 'addAgreementSignedContract', 'another-queue-prod')],
      [queueError(409, 'addAgreementSignedContract', 'interop-safe-storage-completed-tasks-prod-other')],
      [queueError(4090, 'addAgreementSignedContract')],
      [queueError(5000, 'addPurposeRiskAnalysisSignedDocument')],
      [queueError(409, 'addAgreementSignedContractExtra')],
      [queueError(500, 'addPurposeRiskAnalysisSignedDocumentExtra')],
      [queueError(409, 'otherOperation'), 'at async addAgreementSignedContract'],
      [queueError(500, 'otherOperation'), 'at async addPurposeRiskAnalysisSignedDocument'],
      [
        'Generic error occurs processing Queue: interop-safe-storage-completed-tasks-prod',
        'AxiosError: Request failed with status code 409 at async addAgreementSignedContract',
      ],
    ]) {
      assert.deepStrictEqual(matches(messages), []);
    }
  });

  it('does not generalize generic consumer, signature read or timeout failures', () => {
    for (const message of [
      'Unexpected error consuming message: AxiosError: Request failed with status code 409',
      "Error processing message: Error: Error reading signature reference with id='file.gz': AccessDenied",
      'Unable to parse signature reference for id=file.gz',
      'AxiosError: timeout of 30000ms exceeded',
      TIMEOUT.replace('30000', '10000'),
    ])
      assert.deepStrictEqual(matches([message]), []);
  });

  it('does not combine signature read and parsing errors from separate rows', () => {
    assert.deepStrictEqual(
      matches([
        "Error processing message: Error: Error reading signature reference with id='file.gz'",
        "Error: Unable to parse signature reference for id='file.gz'",
      ]),
      [],
    );
  });

  it('does not recognize cases from shared CID tracker evidence alone', () => {
    assert.deepStrictEqual(
      matches(
        [
          PARSE_ERROR,
          TIMEOUT,
          queueError(409, 'addAgreementSignedContract'),
          queueError(500, 'addPurposeRiskAnalysisSignedDocument'),
        ],
        'prod',
        ALARM.stepIds.queryCidTracker,
      ),
      [],
    );
  });

  it('recognizes a conflict without CID and keeps another service’s conflict in a shared trace out', async () => {
    const conflict = queueError(409, 'addAgreementSignedContract');
    const own = await executeAlarmWithLogs(
      buildRunbook(),
      ALARM.runbookKey,
      interopPodResponder({ podApp: ALARM.podApp, messages: [conflict] }),
    );
    assert.deepStrictEqual(own.matchedIds, ['INTEROP_K8S_K8IBSOPEP_SIG-OBJ-AGR-SIG-CON-HTT-409']);

    const shared = await executeAlarmWithLogs(
      buildRunbook(),
      ALARM.runbookKey,
      interopPodResponder({
        podApp: ALARM.podApp,
        messages: ['ERROR - Unknown failure'],
        cid: 'shared-cid',
        trackerMessages: [conflict],
      }),
    );
    // The trace follows the application date embedded in each log line.
    assert.match(shared.queries[1]?.query ?? '', /sort date asc/u);
    assert.deepStrictEqual(shared.matchedIds, []);
  });
});
