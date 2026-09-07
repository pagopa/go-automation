import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CloudWatchLogsQueryStep } from '../../steps/data/CloudWatchLogsQueryStep.js';
import { DynamoDBGetStep } from '../../steps/data/DynamoDBGetStep.js';
import type { Runbook } from '../../types/Runbook.js';
import type { Step } from '../../types/Step.js';
import { assertCloudExecutableRunbook } from '../assertCloudExecutableRunbook.js';

function runbookWith(step: Step): Runbook {
  // Safe: the validator reads only metadata, steps, cases and the policy.
  return {
    metadata: { id: 'test-runbook', version: '1.0.0' },
    steps: [{ step }],
    knownCases: [],
    fallbackAction: { type: 'log', message: 'nothing matched' },
    cloudExecutionPolicy: { sideEffects: 'NONE' },
  } as unknown as Runbook;
}

describe('assertCloudExecutableRunbook — OAM reach', () => {
  it('rejects a runbook reading a service the OAM link cannot carry', () => {
    // The cloud worker runs on the monitoring account and names the source
    // account in its log queries. DynamoDB has no such parameter, so it would
    // read the monitoring account's own table — successfully, with no rows.
    const runbook = runbookWith(new DynamoDBGetStep({ id: 'get', label: 'Get', tableName: 't', key: {} }));

    assert.throws(
      () => assertCloudExecutableRunbook(runbook),
      /reads DynamoDB in step "get".*OAM shares telemetry, not credentials/su,
    );
  });

  it('accepts a runbook reading CloudWatch Logs, which OAM does carry', () => {
    const runbook = runbookWith(
      new CloudWatchLogsQueryStep({
        id: 'logs',
        label: 'Logs',
        logGroups: ['/aws/ecs/pn-delivery'],
        query: 'fields @message',
        timeRangeFromParams: { start: 'startTime', end: 'endTime' },
      }),
    );

    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
  });
});
