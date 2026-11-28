import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CloudWatchLogsQueryStep } from '../../steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
import type { Runbook } from '../../../../engine/types/Runbook.js';
import type { Step } from '../../../../engine/types/Step.js';
import type { StepKind } from '../../../../engine/types/StepKind.js';
import type { StepResult } from '../../../../engine/types/StepResult.js';
import { assertCloudExecutableRunbook } from '../assertCloudExecutableRunbook.js';
import { createTestRunbook } from '../../../../__tests__/helpers/createTestRunbook.js';

/** A step that requires one service, of the given kind. */
class ServiceStep implements Step<void> {
  readonly label = 'Service step';

  constructor(
    readonly id: string,
    readonly kind: StepKind,
    private readonly service: string,
  ) {}

  requiredServices(): ReadonlyArray<string> {
    return [this.service];
  }

  async execute(): Promise<StepResult<void>> {
    return Promise.resolve({ success: true });
  }
}

function runbookWith(step: Step): Runbook {
  return createTestRunbook({ steps: [{ step }], cloudExecutionPolicy: { sideEffects: 'NONE' } });
}

describe('assertCloudExecutableRunbook — OAM reach', () => {
  it('rejects a runbook reading a service the OAM link cannot carry', () => {
    // The cloud worker runs on the monitoring account and names the source
    // account in its log queries. DynamoDB has no such parameter, so it would
    // read the monitoring account's own table — successfully, with no rows.
    const runbook = runbookWith(new ServiceStep('get', 'data', 'dynamodb'));

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

describe('assertCloudExecutableRunbook — side effects', () => {
  it('rejects a mutation step in an update action of a known error', () => {
    const runbook = {
      ...runbookWith(new ServiceStep('read', 'data', 'cloudWatchLogs')),
      knownErrors: [
        {
          id: 'case',
          description: 'case',
          condition: { type: 'exists', ref: 'vars.x' },
          action: {
            type: 'composite',
            actions: [{ type: 'update', step: new ServiceStep('put', 'mutation', 'http') }],
          },
        },
      ],
    } as unknown as Runbook;

    assert.throws(() => assertCloudExecutableRunbook(runbook), /contains mutation step "put"/u);
  });
});
