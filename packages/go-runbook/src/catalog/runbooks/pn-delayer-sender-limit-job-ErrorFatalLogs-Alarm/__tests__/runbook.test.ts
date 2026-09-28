import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveOccurrenceTimeWindow } from '../../../computeRunbookTimeRange.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { DELAYER_SENDER_LIMIT_JOB_ALARM } from '../alarmDefinition.js';
import { DELAYER_ERROR_QUERY, SERVICE } from '../knownServices.js';
import { buildRunbook } from '../runbook.js';

describe('pn-delayer sender limit job runbook', () => {
  it('registers a read-only service log pipeline and the documented source', () => {
    const runbook = buildRunbook();
    assert.strictEqual(runbook.metadata.id, DELAYER_SENDER_LIMIT_JOB_ALARM);
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      [
        'prepare-service-section',
        'query-pn-delayer-sender-limit-job',
        'analyze-pn-delayer-sender-limit-job',
        'classify-delayer-alarm-day',
        'query-pn-delayer-sender-limit-job-trace',
      ],
    );
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.runbookContext, {
      kind: 'service',
      service: SERVICE,
      queryProfileId: 'send-service',
    });
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(runbook.analysisDefaults?.links, [
      {
        url: 'https://pagopa.atlassian.net/wiki/spaces/GO/pages/3351480214/pn-delayer-sender-limit-job-ErrorFatalLogs-Alarm',
        name: DELAYER_SENDER_LIMIT_JOB_ALARM,
        type: 'CONFLUENCE',
      },
    ]);
  });

  it('queries the specified log group for ERROR and uses the catalog 5/5 minute window', () => {
    const runbook = buildRunbook();
    assert.strictEqual(SERVICE.logGroup, '/aws/ecs/pn-delayer-sender-limit-job');
    assert.match(DELAYER_ERROR_QUERY, /filter @message like 'ERROR'/u);
    assert.match(DELAYER_ERROR_QUERY, /display @timestamp, trace_id, message, @message/u);
    assert.match(DELAYER_ERROR_QUERY, /dedup message/u);
    assert.deepStrictEqual(resolveOccurrenceTimeWindow(runbook), { beforeMinutes: 5, afterMinutes: 5 });
  });
});
