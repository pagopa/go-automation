import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadExecuteRunbookDeploymentConfig } from '../config/DeploymentConfig.js';
import { loadExecuteRunbookSourceLinkDeploymentConfig } from '../config/SourceLinkDeploymentConfig.js';
import { buildExecuteRunbookMonitoringPlan } from '../stacks/monitoringPlan.js';

const BASE_ENV = {
  DEPLOY_ENV: 'production',
  WATCHTOWER_INTERNAL_URL: 'https://watchtower.internal',
  WATCHTOWER_VPC_ID: 'vpc-123',
  WATCHTOWER_SUBNET_IDS: 'subnet-a,subnet-b',
  WATCHTOWER_LAMBDA_SECURITY_GROUP_ID: 'sg-123',
  WATCHTOWER_SLACK_INGESTER_ROLE_ARN: 'arn:aws:iam::170533023216:role/watchtower-slack',
  WATCHTOWER_BACKEND_ROLE_ARN: 'arn:aws:iam::170533023216:role/watchtower-backend',
  WATCHTOWER_SERVICE_PRINCIPAL_SECRET_ARN: 'arn:aws:secretsmanager:eu-south-1:170533023216:secret:runbook-worker',
  OAM_SOURCE_ACCOUNT_IDS: '123456789012,210987654321',
} as const;

describe('execute-runbook monitoring plan', () => {
  it('uses deterministic names and capacity constraints in two regions', () => {
    const supported = new Set(['eu-south-1', 'eu-west-1']);
    for (const region of supported) {
      const config = loadExecuteRunbookDeploymentConfig({ ...BASE_ENV, DEPLOY_REGION: region }, supported);
      const plan = buildExecuteRunbookMonitoringPlan(config);
      assert.strictEqual(plan.names.lambdaName, `go-execute-runbook-production-${region}`);
      assert.strictEqual(plan.names.queueName, `go-execute-runbook-production-${region}.fifo`);
      assert.strictEqual(plan.visibilityTimeoutSeconds, 6 * plan.lambdaTimeoutSeconds);
      assert.strictEqual(plan.batchSize, 1);
      assert.strictEqual(plan.partialBatchResponse, true);
      assert.strictEqual(plan.dlqHasConsumer, false);
    }
  });

  it('rejects missing integration inputs and non-TLS Watchtower URLs', () => {
    assert.throws(() => loadExecuteRunbookDeploymentConfig({ DEPLOY_ENV: 'dev' }), /DEPLOY_REGION/);
    assert.throws(
      () =>
        loadExecuteRunbookDeploymentConfig({
          ...BASE_ENV,
          DEPLOY_REGION: 'eu-south-1',
          WATCHTOWER_INTERNAL_URL: 'http://watchtower',
        }),
      /must use TLS/,
    );
  });
});

describe('execute-runbook source OAM link config', () => {
  it('requires an explicit sink, label and bounded log-group filter', () => {
    const config = loadExecuteRunbookSourceLinkDeploymentConfig(
      {
        DEPLOY_ENV: 'production',
        DEPLOY_REGION: 'eu-south-1',
        OAM_SINK_ARN: 'arn:aws:oam:eu-south-1:170533023216:sink/sink-id',
        OAM_LINK_LABEL_TEMPLATE: '$AccountName',
        OAM_LOG_GROUP_FILTER: "LogGroupName LIKE '/aws/lambda/pn-%'",
      },
      new Set(['eu-south-1']),
    );

    assert.strictEqual(config.region, 'eu-south-1');
    assert.match(config.logGroupFilter, /LogGroupName/);
  });

  it('rejects an invalid sink or a filter unrelated to log groups', () => {
    assert.throws(
      () =>
        loadExecuteRunbookSourceLinkDeploymentConfig(
          {
            DEPLOY_ENV: 'production',
            DEPLOY_REGION: 'eu-south-1',
            OAM_SINK_ARN: 'not-an-arn',
            OAM_LINK_LABEL_TEMPLATE: '$AccountName',
            OAM_LOG_GROUP_FILTER: "LogGroupName LIKE '/aws/lambda/pn-%'",
          },
          new Set(['eu-south-1']),
        ),
      /OAM sink ARN/,
    );
  });
});
