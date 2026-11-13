import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CloudWatchLogsQueryStep } from '../../steps/aws/cloudwatch-logs/CloudWatchLogsQueryStep.js';
import { DynamoDBGetStep } from '../../steps/aws/dynamodb/DynamoDBGetStep.js';
import { HttpRequestStep } from '../../steps/networking/HttpRequestStep.js';
import { IfBranchStep } from '../../../../engine/steps/control/IfBranchStep.js';
import type { Runbook } from '../../../../engine/types/Runbook.js';
import type { Step } from '../../../../engine/types/Step.js';
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

describe('assertCloudExecutableRunbook — HTTP requests (RBREORG-21)', () => {
  function request(method: string): HttpRequestStep {
    return new HttpRequestStep({ id: 'http', label: 'HTTP', method, url: 'https://example.invalid/resource' });
  }

  it('accepts a literal GET or HEAD', () => {
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbookWith(request('GET'))));
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbookWith(request('head'))));
  });

  it('rejects a writing request in the pipeline, and a method resolved at runtime', () => {
    assert.throws(() => assertCloudExecutableRunbook(runbookWith(request('DELETE'))), /non read-only HTTP request/u);
    assert.throws(
      () => assertCloudExecutableRunbook(runbookWith(request('{{vars.method}}'))),
      /non read-only HTTP request in step "http"/u,
    );
  });

  it('rejects a writing request nested in an IfBranchStep', () => {
    const branch = new IfBranchStep({
      id: 'branch',
      label: 'Branch',
      condition: { type: 'exists', ref: 'vars.x' },
      thenSteps: [request('POST')],
    });

    assert.throws(
      () => assertCloudExecutableRunbook(runbookWith(branch)),
      /non read-only HTTP request in step "http"/u,
    );
  });

  it('rejects a writing request in an update action of a known case', () => {
    const runbook = {
      ...runbookWith(request('GET')),
      knownCases: [
        {
          id: 'case',
          description: 'case',
          priority: 1,
          condition: { type: 'exists', ref: 'vars.x' },
          action: { type: 'composite', actions: [{ type: 'update', step: request('PUT') }] },
        },
      ],
    } as unknown as Runbook;

    assert.throws(() => assertCloudExecutableRunbook(runbook), /non read-only HTTP request/u);
  });
});
