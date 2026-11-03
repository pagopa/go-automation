import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator, type RunbookContext } from '../../framework.js';
import { SIGNED_OBJECTS_PERSISTER_ALARM as ALARM } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';

const PARSE_ERROR =
  "Error processing message: Error: Error reading signature reference with id='file.gz' from table 'interop-safe-storage-signature-tracking-prod': Error: Unable to parse signature reference for id='file.gz'";
const TIMEOUT =
  'Error processing message: Error: Error getting file content on safe storage, details: AxiosError: timeout of 30000ms exceeded';

function queueError(status: number, operation: string, queue = 'interop-safe-storage-completed-tasks-prod'): string {
  return `Generic error occurs processing Queue: https://sqs.example/${queue}. Details: AxiosError: Request failed with status code ${String(status)}\n    at async ${operation} (metadata.js:14:5)`;
}

function context(
  messages: ReadonlyArray<string>,
  environment = 'prod',
  stepId = ALARM.stepIds.queryApplicationLogs,
): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-10-08T11:49:49.000Z'),
    stepResults: new Map([[stepId, messages.map((value) => [{ field: '@message', value }])]]),
    vars: new Map([['interopEnvironment', environment]]),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function matches(ctx: RunbookContext): ReadonlyArray<string> {
  const evaluator = new ConditionEvaluator();
  return KNOWN_CASES.filter((candidate) => evaluator.evaluate(candidate.condition, ctx)).map(({ id }) => id);
}

describe('Signed objects persister known cases', () => {
  for (const [id, message] of [
    ['signed-objects-signature-reference-parse-error', PARSE_ERROR],
    ['signed-objects-purpose-risk-analysis-http-500', queueError(500, 'addPurposeRiskAnalysisSignedDocument')],
    ['signed-objects-safe-storage-file-timeout', TIMEOUT],
    ['signed-objects-agreement-signed-contract-http-409', queueError(409, 'addAgreementSignedContract')],
  ] as const) {
    it(`recognizes the documented signature in raw and structured logs: ${id}`, () => {
      assert.deepStrictEqual(matches(context([message])), [id]);
      assert.deepStrictEqual(matches(context([JSON.stringify({ log: message, pod_app: ALARM.podApp })])), [id]);
    });

    it(`does not extend the production case to other environments: ${id}`, () => {
      for (const environment of ['att', 'test', 'dev']) {
        assert.deepStrictEqual(matches(context([message], environment)), []);
      }
    });
  }

  it('accepts the source timeout with the last character truncated', () => {
    assert.deepStrictEqual(matches(context([TIMEOUT.slice(0, -1)])), ['signed-objects-safe-storage-file-timeout']);
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
      assert.deepStrictEqual(matches(context(messages)), []);
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
      assert.deepStrictEqual(matches(context([message])), []);
  });

  it('does not combine signature read and parsing errors from separate rows', () => {
    assert.deepStrictEqual(
      matches(
        context([
          "Error processing message: Error: Error reading signature reference with id='file.gz'",
          "Error: Unable to parse signature reference for id='file.gz'",
        ]),
      ),
      [],
    );
  });

  it('does not recognize cases from shared CID tracker evidence alone', () => {
    assert.deepStrictEqual(
      matches(
        context(
          [
            PARSE_ERROR,
            TIMEOUT,
            queueError(409, 'addAgreementSignedContract'),
            queueError(500, 'addPurposeRiskAnalysisSignedDocument'),
          ],
          'prod',
          ALARM.stepIds.queryCidTracker,
        ),
      ),
      [],
    );
  });

  it('preserves the documented conditional resolutions and references', () => {
    const risk = KNOWN_CASES.find(({ id }) => id === 'signed-objects-purpose-risk-analysis-http-500');
    const timeout = KNOWN_CASES.find(({ id }) => id === 'signed-objects-safe-storage-file-timeout');
    assert.match(
      risk?.analysis?.resolution ?? '',
      /se si presenta durante i rilasci che coinvolgono questo tipo di attività/u,
    );
    assert.ok(risk?.analysis?.links?.some(({ url }) => url.endsWith('/PIN-8813')));
    assert.match(timeout?.analysis?.resolution ?? '', /se il timeout è momentaneo/u);
    assert.match(timeout?.analysis?.resolution ?? '', /elevate e ravvicinate, segnalare al team prodotto/u);
    for (const id of [
      'signed-objects-signature-reference-parse-error',
      'signed-objects-agreement-signed-contract-http-409',
    ]) {
      assert.strictEqual(
        KNOWN_CASES.find((candidate) => candidate.id === id)?.analysis?.resolution,
        'Risoluzione non documentata.',
      );
    }
  });

  it('keeps all cases open with no inferred downstream or final action', () => {
    for (const candidate of KNOWN_CASES) {
      assert.strictEqual(candidate.analysis?.proposedStatus, 'IN_PROGRESS');
      assert.strictEqual(candidate.analysis?.analysisType, 'ANALYZABLE');
      assert.deepStrictEqual(candidate.analysis?.finalActions, []);
      assert.strictEqual(candidate.analysis?.downstreams, undefined);
    }
  });
});
