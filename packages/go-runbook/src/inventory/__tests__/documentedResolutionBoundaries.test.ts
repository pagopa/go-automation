import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RUNBOOK_CATALOG } from '../registry/runbookRegistry.js';
import { createTestContext } from '../../__tests__/helpers/createTestContext.js';
import { matchingKnownErrorCodes } from '../../__tests__/helpers/knownErrorMatching.js';
import { logRow } from '../../__tests__/helpers/logRow.js';

describe('documented operational boundaries', () => {
  it('does not prescribe generic configuration changes or internal IO database checks', () => {
    for (const descriptor of RUNBOOK_CATALOG.listDescriptors()) {
      const runbook = RUNBOOK_CATALOG.resolveByKey(descriptor.key)!.build();
      for (const knownError of runbook.knownErrors) {
        const guidance = [knownError.analysis?.resolution, ...(knownError.analysis?.finalActions ?? [])].join(' ');
        assert.doesNotMatch(
          guidance,
          /Aumentare la memoria|Verificare il timeout configurato e la Max Concurrency|verificare[^.]*Cosmos DB|smaltimento del lag|archiviazioni attese/iu,
          `${descriptor.key}: ${knownError.code}`,
        );
        if (knownError.analysis?.resolution === 'Risoluzione non documentata.') {
          assert.notStrictEqual(knownError.analysis.proposedStatus, 'COMPLETED', knownError.code);
          assert.deepStrictEqual(knownError.analysis.finalActions ?? [], [], knownError.code);
        }
      }
    }
  });

  it('does not conclude S3 recovery from matching record counts, REPORT or an old recovery variable', () => {
    const runbook = RUNBOOK_CATALOG.resolveByKey('pn-downstream-monitoring-lambda-LogInvocationErrors-Alarm')!.build();
    const context = createTestContext({
      stepResults: {
        'query-lambda-errors': [
          logRow({
            '@message':
              'ERROR Invoke Error {"errorType":"SlowDown","errorMessage":"Please reduce your request rate.","$metadata":{"httpStatusCode":503},"stack":["S3RestXmlProtocol.handleError"]}',
          }),
          logRow({ '@message': 'Written 8 record(s) to s3://example/batch' }),
          logRow({ '@message': 'REPORT RequestId: example Duration: 100 ms' }),
        ],
      },
      vars: { downstreamMonitoringS3Recovery: 'RECOVERED_ALL' },
    });
    const matched = runbook.knownErrors.filter(({ code }) =>
      matchingKnownErrorCodes(runbook.knownErrors, context).includes(code),
    );
    assert.deepStrictEqual(
      matched.map(({ code }) => code),
      ['SEND_LAMBDA_PDMLLIEA_DOW-MON-S3-SLO-DOW'],
    );
    assert.ok(matched.every(({ analysis }) => analysis?.proposedStatus === 'IN_PROGRESS'));
  });
});
