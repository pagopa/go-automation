import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lambda } from '../../../../../toolkits/send/index.js';
import { ConditionEvaluator, type KnownError, type RunbookContext } from '../../../../../engine/index.js';

import { KNOWN_ERRORS } from '../knownErrors.js';
import { createTestContext } from '../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../__tests__/helpers/logRow.js';

function contextWithMessages(messages: ReadonlyArray<string>, category?: string): RunbookContext {
  const rows = messages.map((message) =>
    logRow({ '@requestId': 'c6b49674-286d-424f-8074-5e19a69dc7a8', '@message': message }),
  );
  const lambdaErrorCategory =
    category ?? lambda.scanLambdaLogs(rows, lambda.SEND_LAMBDA_PROFILE.downstreamSignatures)?.category ?? 'unknown';
  return createTestContext({ stepResults: { 'query-lambda-errors': rows }, vars: { lambdaErrorCategory } });
}

function byId(id: string): KnownError {
  const found = KNOWN_ERRORS.find((knownError) => knownError.code === id);
  assert.ok(found, `Known error missing: ${id}`);
  return found;
}

const INVALID_CONSENTS_LOG =
  'ERROR Record routed to quarantine. EventID=event-1, Result=Ok, ProcessingLayer=quarantine, ' +
  'TableName=pn-UserAttributes, ImageSource=NewImage, ' +
  'Errors=[{"code":"DQ_INVALID_CONSENTS","check":"check_invalid_consents"}]';

describe('pn-cdc preprocessing known errors', () => {
  const evaluator = new ConditionEvaluator();

  it('recognizes the documented invalid-consents quarantine without closing the analysis', () => {
    const knownError = byId('SEND_LAMBDA_PCPDQFLIEA_CDC-PRE-INV-CON-QUA');
    assert.strictEqual(evaluator.evaluate(knownError.condition, contextWithMessages([INVALID_CONSENTS_LOG])), true);
  });

  it('recognizes a different documented DQ quarantine and keeps the specific case ahead of it', () => {
    const otherDqLog = INVALID_CONSENTS_LOG.replace(
      '"DQ_INVALID_CONSENTS","check":"check_invalid_consents"',
      '"DQ_ADDRESSHASH_NOT_NULL","check":"check_addresshash_not_null"',
    );
    const specific = byId('SEND_LAMBDA_PCPDQFLIEA_CDC-PRE-INV-CON-QUA');
    const generic = byId('SEND_LAMBDA_PCPDQFLIEA_CDC-PRE-OTH-DQ-QUA');

    assert.strictEqual(evaluator.evaluate(specific.condition, contextWithMessages([otherDqLog])), false);
    assert.strictEqual(evaluator.evaluate(generic.condition, contextWithMessages([otherDqLog])), true);
    assert.deepStrictEqual(specific.supersedes, ['SEND_LAMBDA_PCPDQFLIEA_CDC-PRE-OTH-DQ-QUA']);
  });

  it('does not mistake a processing failure or a wrong table for the documented quarantine', () => {
    const quarantine = byId('SEND_LAMBDA_PCPDQFLIEA_CDC-PRE-OTH-DQ-QUA');
    const failed = INVALID_CONSENTS_LOG.replace('Result=Ok', 'Result=ProcessingFailed');
    const wrongTable = INVALID_CONSENTS_LOG.replace('TableName=pn-UserAttributes', 'TableName=another-table');

    assert.strictEqual(evaluator.evaluate(quarantine.condition, contextWithMessages([failed])), false);
    assert.strictEqual(evaluator.evaluate(quarantine.condition, contextWithMessages([wrongTable])), false);
    assert.strictEqual(
      evaluator.evaluate(
        quarantine.condition,
        contextWithMessages([
          'ERROR Record routed to quarantine. Result=Ok',
          'ERROR ProcessingLayer=quarantine TableName=pn-UserAttributes ImageSource=NewImage Errors=[]',
        ]),
      ),
      false,
    );
  });

  it('classifies technical processing failures separately from functional quarantine', () => {
    const knownError = byId('SEND_LAMBDA_PCPDQFLIEA_CDC-PRE-PRO-FAI');
    const technicalLog =
      'ERROR PROCESSING_FAILED Technical error during record processing. ' +
      'RecordID=processing-failed-record-1, ErrorType=JSONDecodeError, Error=Expecting value';

    assert.strictEqual(evaluator.evaluate(knownError.condition, contextWithMessages([technicalLog])), true);
    assert.strictEqual(evaluator.evaluate(knownError.condition, contextWithMessages([INVALID_CONSENTS_LOG])), false);
  });

  it('leaves runtime timeout and OOM to the shared Lambda runtime cases', () => {
    const quarantine = byId('SEND_LAMBDA_PCPDQFLIEA_CDC-PRE-INV-CON-QUA');
    const technical = byId('SEND_LAMBDA_PCPDQFLIEA_CDC-PRE-PRO-FAI');
    const technicalLog = 'ERROR PROCESSING_FAILED Technical error during record processing. RecordID=record-1';

    for (const category of ['timeout', 'out-of-memory']) {
      assert.strictEqual(
        evaluator.evaluate(quarantine.condition, contextWithMessages([INVALID_CONSENTS_LOG], category)),
        false,
      );
      assert.strictEqual(evaluator.evaluate(technical.condition, contextWithMessages([technicalLog], category)), false);
    }
  });

  it('gives runtime cases precedence over quarantine and processing errors in separate rows', () => {
    const technicalLog = 'ERROR PROCESSING_FAILED Technical error during record processing. RecordID=record-1';
    for (const [runtimeLog, expectedKnownErrorCode] of [
      ['Task timed out after 10.00 seconds', 'SEND_LAMBDA_COMMON_LAM-TIM'],
      ['FATAL ERROR: JavaScript heap out of memory', 'SEND_LAMBDA_COMMON_LAM-OUT-OF-MEM'],
    ] as const) {
      for (const applicationLog of [INVALID_CONSENTS_LOG, technicalLog]) {
        const ctx = contextWithMessages([applicationLog, runtimeLog]);
        const matches = KNOWN_ERRORS.filter(({ condition }) => evaluator.evaluate(condition, ctx));
        assert.deepStrictEqual(
          matches.map(({ code }) => code),
          [expectedKnownErrorCode],
        );
      }
    }
  });
});
