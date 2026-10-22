import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RUNBOOK_CATALOG } from '../RunbookCatalog.js';
import { ConditionEvaluator } from '../../core/ConditionEvaluator.js';
import { createTestServiceRegistry } from '../../registry/createTestServiceRegistry.js';
import type { RunbookContext } from '../../types/RunbookContext.js';

describe('documented operational boundaries', () => {
  it('does not prescribe generic configuration changes or internal IO database checks', () => {
    for (const descriptor of RUNBOOK_CATALOG.listDescriptors()) {
      const runbook = RUNBOOK_CATALOG.resolveByKey(descriptor.key)!.build();
      for (const knownCase of runbook.knownCases) {
        const guidance = [knownCase.analysis?.resolution, ...(knownCase.analysis?.finalActions ?? [])].join(' ');
        assert.doesNotMatch(
          guidance,
          /Aumentare la memoria|Verificare il timeout configurato e la Max Concurrency|verificare[^.]*Cosmos DB|smaltimento del lag|archiviazioni attese/iu,
          `${descriptor.key}: ${knownCase.id}`,
        );
        if (knownCase.analysis?.resolution === 'Risoluzione non documentata.') {
          assert.notStrictEqual(knownCase.analysis.proposedStatus, 'COMPLETED', knownCase.id);
          assert.deepStrictEqual(knownCase.analysis.finalActions ?? [], [], knownCase.id);
        }
      }
    }
  });

  it('does not conclude S3 recovery from matching record counts, REPORT or an old recovery variable', () => {
    const runbook = RUNBOOK_CATALOG.resolveByKey('pn-downstream-monitoring-lambda-LogInvocationErrors-Alarm')!.build();
    const context: RunbookContext = {
      executionId: 'source-boundary',
      startedAt: new Date('2026-09-08T14:00:00Z'),
      stepResults: new Map([
        [
          'query-lambda-errors',
          [
            [
              {
                field: '@message',
                value:
                  'ERROR Invoke Error {"errorType":"SlowDown","errorMessage":"Please reduce your request rate.","$metadata":{"httpStatusCode":503},"stack":["S3RestXmlProtocol.handleError"]}',
              },
            ],
            [{ field: '@message', value: 'Written 8 record(s) to s3://example/batch' }],
            [{ field: '@message', value: 'REPORT RequestId: example Duration: 100 ms' }],
          ],
        ],
      ]),
      vars: new Map([['downstreamMonitoringS3Recovery', 'RECOVERED_ALL']]),
      params: new Map(),
      logs: [],
      services: createTestServiceRegistry(),
      recoveredErrors: [],
    };
    const evaluator = new ConditionEvaluator();
    const matched = runbook.knownCases.filter((knownCase) => evaluator.evaluate(knownCase.condition, context));
    assert.deepStrictEqual(
      matched.map(({ id }) => id),
      ['downstream-monitoring-s3-slow-down'],
    );
    assert.ok(matched.every(({ analysis }) => analysis?.proposedStatus === 'IN_PROGRESS'));
    assert.ok(!runbook.steps.some(({ step }) => step.id === 'analyze-s3-recovery'));
  });
});
