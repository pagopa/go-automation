import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';

import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator, lambda } from '../../framework.js';
import type { KnownCase, RunbookContext } from '../../framework.js';
import { KNOWN_CASES } from '../knownCases.js';

function contextWithError(message: string): RunbookContext {
  const row: ReadonlyArray<ResultField> = [
    { field: '@timestamp', value: '2026-09-08T14:13:28.000Z' },
    { field: '@requestId', value: 'b95bb742-cc30-4f07-80bc-45a38011e5c4' },
    { field: '@message', value: message },
  ];

  return {
    executionId: 'test',
    startedAt: new Date('2026-09-08T14:14:00.000Z'),
    stepResults: new Map([['query-lambda-errors', [row]]]),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function byId(id: string): KnownCase {
  const knownCase = KNOWN_CASES.find((candidate) => candidate.id === id);
  assert.ok(knownCase !== undefined, `known case not found: ${id}`);
  return knownCase;
}

describe('pn-downstream-monitoring-lambda known cases', () => {
  const evaluator = new ConditionEvaluator();

  it('requires monitoring and Infra verification after observed S3 recovery', () => {
    const knownCase = byId('downstream-monitoring-s3-slow-down-recovered');
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'COMPLETED');
    const finalActions = knownCase.analysis?.finalActions?.join(' ') ?? '';
    assert.match(finalActions, /Monitorare la ricorrenza/u);
    assert.match(finalActions, /verificare con Infra lo stato/u);
    assert.match(finalActions, /intervento citato nella segnalazione storica/u);
    assert.doesNotMatch(finalActions, /Non è necessario altro confronto/u);
  });

  for (const runtimeCase of lambda.LAMBDA_RUNTIME_KNOWN_CASES) {
    it(`preserves console evidence for ${runtimeCase.id} while replacing the resolution`, () => {
      const knownCase = byId(runtimeCase.id);
      assert.strictEqual(runtimeCase.action.type, 'log');
      assert.strictEqual(knownCase.action.type, 'log');
      if (runtimeCase.action.type !== 'log' || knownCase.action.type !== 'log') return;

      assert.strictEqual(knownCase.action.title, runtimeCase.action.title);
      const details = knownCase.action.details ?? [];
      assert.deepStrictEqual(
        details.filter(([label]) => label !== 'Risoluzione' && label !== 'Account con errori'),
        (runtimeCase.action.details ?? []).filter(([label]) => label !== 'Risoluzione'),
      );
      assert.deepStrictEqual(
        details.filter(([label]) => label === 'Account con errori'),
        [['Account con errori', '{{vars.downstreamMonitoringErrorAccounts}}']],
      );
      assert.deepStrictEqual(
        details.filter(([label]) => label === 'Risoluzione'),
        [['Risoluzione', knownCase.analysis?.resolution]],
      );
      assert.notStrictEqual(knownCase.analysis?.resolution, runtimeCase.analysis?.resolution);
      assert.match(knownCase.analysis?.resolution ?? '', /analisi aperta/u);
      assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    });
  }

  it('matches the complete SlowDown 503 signature documented in Confluence', () => {
    const message =
      'ERROR\tInvoke Error\t{"errorType":"SlowDown","errorMessage":"Please reduce your request rate.","$fault":"server","$metadata":{"httpStatusCode":503,"requestId":"request-1"}}';
    const knownCase = byId('downstream-monitoring-aws-slow-down');

    assert.strictEqual(evaluator.evaluate(knownCase.condition, contextWithError(message)), true);
    assert.strictEqual(knownCase.analysis?.proposedStatus, 'IN_PROGRESS');
    assert.match(knownCase.analysis?.resolution ?? '', /account core/u);
    assert.match(knownCase.analysis?.resolution ?? '', /core e confinfo/u);
    assert.match(knownCase.analysis?.resolution ?? '', /sezione Monitoring della Lambda/u);
    assert.doesNotMatch(knownCase.analysis?.resolution ?? '', /Written|recupero dei record|remediation completata/u);
  });

  it('does not match a generic HTTP 503 or an incomplete SlowDown message', () => {
    const knownCase = byId('downstream-monitoring-aws-slow-down');

    assert.strictEqual(
      evaluator.evaluate(knownCase.condition, contextWithError('ERROR downstream returned HTTP 503')),
      false,
    );
    assert.strictEqual(
      evaluator.evaluate(
        knownCase.condition,
        contextWithError('ERROR Invoke Error {"errorType":"SlowDown","httpStatusCode":503}'),
      ),
      false,
    );
  });

  it('accepts reordered JSON and requires exact keys, types and values', () => {
    const knownCase = byId('downstream-monitoring-aws-slow-down');
    const payload = {
      $metadata: { httpStatusCode: 503 },
      errorMessage: 'Please reduce your request rate.',
      errorType: 'SlowDown',
    };
    const message = `ERROR Invoke Error ${JSON.stringify(payload)}`;
    assert.strictEqual(evaluator.evaluate(knownCase.condition, contextWithError(message)), true);
    for (const invalid of [
      message.replace('503', '5030'),
      message.replace('503', '503.5'),
      message.replace('503', '"503"'),
      message.replace('httpStatusCode', 'otherStatusCode'),
      message.replace('errorType', 'otherErrorType'),
      message.replace('SlowDown', 'SlowDownOther'),
      message.replace('request rate.', 'request rate. Other error'),
    ]) {
      assert.strictEqual(evaluator.evaluate(knownCase.condition, contextWithError(invalid)), false, invalid);
    }
  });

  it('distinguishes an S3 stack from an unidentified AWS SlowDown', () => {
    const message = `ERROR Invoke Error ${JSON.stringify({
      errorType: 'SlowDown',
      errorMessage: 'Please reduce your request rate.',
      $metadata: { httpStatusCode: 503 },
      stack: ['at S3RestXmlProtocol.handleError (...)'],
    })}`;
    assert.strictEqual(
      evaluator.evaluate(byId('downstream-monitoring-s3-slow-down').condition, contextWithError(message)),
      true,
    );
    assert.strictEqual(
      evaluator.evaluate(byId('downstream-monitoring-aws-slow-down').condition, contextWithError(message)),
      false,
    );
  });
});
