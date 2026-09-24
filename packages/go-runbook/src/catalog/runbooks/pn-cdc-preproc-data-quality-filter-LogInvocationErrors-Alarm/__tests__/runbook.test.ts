import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';

import { resolveOccurrenceTimeWindow } from '../../../computeRunbookTimeRange.js';
import { RUNBOOK_CATALOG } from '../../../RunbookCatalog.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator } from '../../framework.js';
import type { KnownCase, RunbookContext } from '../../framework.js';

import { CDC_PREPROC_DATA_QUALITY_FILTER_ALARM } from '../alarmDefinition.js';
import { KNOWN_CASES } from '../knownCases.js';
import { LAMBDA_FUNCTION } from '../knownServices.js';
import { buildRunbook } from '../runbook.js';

function contextWithMessages(messages: ReadonlyArray<string>, category = 'application-error'): RunbookContext {
  const rows: ReadonlyArray<ReadonlyArray<ResultField>> = messages.map((message) => [
    { field: '@timestamp', value: '2026-08-25T08:06:00.000Z' },
    { field: '@requestId', value: 'c6b49674-286d-424f-8074-5e19a69dc7a8' },
    { field: '@message', value: message },
  ]);

  return {
    executionId: 'cdc-test',
    startedAt: new Date('2026-08-25T08:06:00.000Z'),
    stepResults: new Map([['query-lambda-errors', rows]]),
    vars: new Map([['lambdaErrorCategory', category]]),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function byId(id: string): KnownCase {
  const found = KNOWN_CASES.find((knownCase) => knownCase.id === id);
  assert.ok(found, `Known case missing: ${id}`);
  return found;
}

const INVALID_CONSENTS_LOG =
  'ERROR Record routed to quarantine. EventID=event-1, Result=Ok, ProcessingLayer=quarantine, ' +
  'TableName=pn-UserAttributes, ImageSource=NewImage, ' +
  'Errors=[{"code":"DQ_INVALID_CONSENTS","check":"check_invalid_consents"}]';

describe('pn-cdc preprocessing runbook', () => {
  const evaluator = new ConditionEvaluator();

  it('registers the documented alarm and reads the Lambda function log group', () => {
    const resolved = RUNBOOK_CATALOG.resolveByAlarmName(CDC_PREPROC_DATA_QUALITY_FILTER_ALARM);
    assert.ok(resolved);
    assert.strictEqual(resolved.product, 'SEND');
    assert.strictEqual(resolved.descriptor.kind, 'LAMBDA');
    assert.deepStrictEqual(resolved.descriptor.categories, ['INTEGRATION']);

    const runbook = buildRunbook();
    assert.strictEqual(runbook.metadata.id, CDC_PREPROC_DATA_QUALITY_FILTER_ALARM);
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      [
        'prepare-lambda-section',
        'query-lambda-errors',
        'parse-lambda-errors',
        'query-lambda-invocation',
        'analyze-lambda-invocation',
      ],
    );
    assert.strictEqual(LAMBDA_FUNCTION.name, 'pn-cdc-preproc-data-quality-filter');
    assert.strictEqual(LAMBDA_FUNCTION.logGroup, '/aws/lambda/pn-cdc-preproc-data-quality-filter');
    assert.deepStrictEqual(resolveOccurrenceTimeWindow(runbook), { beforeMinutes: 5, afterMinutes: 5 });
    assert.ok(runbook.analysisDefaults?.links?.some((link) => link.url.includes('/3285942423/')));
  });

  it('recognizes the documented invalid-consents quarantine without closing the analysis', () => {
    const knownCase = byId('cdc-preproc-invalid-consents-quarantine');
    assert.strictEqual(evaluator.evaluate(knownCase.condition, contextWithMessages([INVALID_CONSENTS_LOG])), true);
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.strictEqual(knownCase.analysis?.analysisType, 'ANALYZABLE');
    assert.match(knownCase.analysis?.resolution ?? '', /Result=Ok/u);
    assert.match(knownCase.analysis?.resolution ?? '', /UAT/u);
  });

  it('recognizes a different documented DQ quarantine and keeps the specific case ahead of it', () => {
    const otherDqLog = INVALID_CONSENTS_LOG.replace(
      '"DQ_INVALID_CONSENTS","check":"check_invalid_consents"',
      '"DQ_ADDRESSHASH_NOT_NULL","check":"check_addresshash_not_null"',
    );
    const specific = byId('cdc-preproc-invalid-consents-quarantine');
    const generic = byId('cdc-preproc-other-dq-quarantine');

    assert.strictEqual(evaluator.evaluate(specific.condition, contextWithMessages([otherDqLog])), false);
    assert.strictEqual(evaluator.evaluate(generic.condition, contextWithMessages([otherDqLog])), true);
    assert.ok(specific.priority > generic.priority);
  });

  it('does not mistake a processing failure or a wrong table for the documented quarantine', () => {
    const quarantine = byId('cdc-preproc-other-dq-quarantine');
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
    const knownCase = byId('cdc-preproc-processing-failed');
    const technicalLog =
      'ERROR PROCESSING_FAILED Technical error during record processing. ' +
      'RecordID=processing-failed-record-1, ErrorType=JSONDecodeError, Error=Expecting value';

    assert.strictEqual(evaluator.evaluate(knownCase.condition, contextWithMessages([technicalLog])), true);
    assert.strictEqual(evaluator.evaluate(knownCase.condition, contextWithMessages([INVALID_CONSENTS_LOG])), false);
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.match(knownCase.analysis?.resolution ?? '', /Firehose/u);
  });

  it('leaves runtime timeout and OOM to the shared Lambda runtime cases', () => {
    const quarantine = byId('cdc-preproc-invalid-consents-quarantine');
    const technical = byId('cdc-preproc-processing-failed');
    const technicalLog = 'ERROR PROCESSING_FAILED Technical error during record processing. RecordID=record-1';

    for (const category of ['timeout', 'out-of-memory']) {
      assert.strictEqual(
        evaluator.evaluate(quarantine.condition, contextWithMessages([INVALID_CONSENTS_LOG], category)),
        false,
      );
      assert.strictEqual(evaluator.evaluate(technical.condition, contextWithMessages([technicalLog], category)), false);
    }
  });
});
