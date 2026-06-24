import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadExecuteRunbookDeploymentConfig } from '../config/DeploymentConfig.js';
import { loadExecuteRunbookSourceLinkDeploymentConfig } from '../config/SourceLinkDeploymentConfig.js';
import { buildExecuteRunbookMonitoringPlan } from '../stacks/monitoringPlan.js';

const BASE_ENV = {
  DEPLOY_ENV: 'production',
  WATCHTOWER_INTERNAL_URL: 'https://watchtower.internal',
  WATCHTOWER_VPC_ID: 'vpc-123abc',
  WATCHTOWER_PRIVATE_SUBNET_ID: 'subnet-abc123',
  WATCHTOWER_NAT_GATEWAY_ID: 'nat-abc123',
  EXECUTE_RUNBOOK_WORKER_SUBNET_CIDR: '172.31.65.0/24',
  WATCHTOWER_SLACK_INGESTER_ROLE_ARN: 'arn:aws:iam::170533023216:role/watchtower-slack',
  WATCHTOWER_BACKEND_ROLE_ARN: 'arn:aws:iam::170533023216:role/watchtower-backend',
  WATCHTOWER_SERVICE_PRINCIPAL_SECRET_ARN: 'arn:aws:secretsmanager:eu-south-1:170533023216:secret:runbook-worker',
  OAM_SOURCE_ACCOUNT_IDS: '123456789012,210987654321',
} as const;

describe('execute-runbook monitoring plan', () => {
  it('uses fixed resource names independently of environment and region', () => {
    const supported = new Set(['eu-south-1', 'eu-west-1']);
    for (const region of supported) {
      const config = loadExecuteRunbookDeploymentConfig(
        { ...BASE_ENV, DEPLOY_REGION: region, EXECUTE_RUNBOOK_WORKER_SUBNET_AZ: `${region}a` },
        supported,
      );
      const plan = buildExecuteRunbookMonitoringPlan(config);
      assert.strictEqual(plan.names.lambdaName, 'go-execute-runbook');
      assert.strictEqual(plan.names.queueName, 'go-execute-runbook.fifo');
      assert.strictEqual(plan.names.dlqName, 'go-execute-runbook-dlq.fifo');
      assert.strictEqual(plan.names.logGroupName, '/aws/lambda/go-execute-runbook');
      assert.strictEqual(plan.visibilityTimeoutSeconds, 6 * plan.lambdaTimeoutSeconds);
      assert.strictEqual(plan.batchSize, 1);
      assert.strictEqual(plan.partialBatchResponse, true);
      assert.strictEqual(plan.dlqHasConsumer, false);
    }
  });

  it('defaults the known Watchtower production topology from the inventory', () => {
    const config = loadExecuteRunbookDeploymentConfig({
      DEPLOY_ENV: 'production',
      DEPLOY_REGION: 'eu-south-1',
    });

    assert.strictEqual(config.watchtowerInternalUrl, 'https://d2xwbj6sp8axq2.cloudfront.net/bff');
    assert.strictEqual(config.vpcId, 'vpc-043f4b7213d4ca900');
    assert.strictEqual(config.watchtowerPrivateSubnetId, 'subnet-079dcb5ef09865dc2');
    assert.strictEqual(config.watchtowerNatGatewayId, 'nat-0b886fee7edcdc400');
    assert.strictEqual(config.workerSubnetCidrBlock, '172.31.65.0/24');
    assert.strictEqual(config.workerSubnetAvailabilityZone, 'eu-south-1b');
    assert.strictEqual(config.servicePrincipalSecretArn, undefined);
    assert.deepStrictEqual(config.oamSourceAccountIds, ['170533023216']);
  });

  it('rejects missing integration inputs and non-TLS Watchtower URLs', () => {
    assert.throws(() => loadExecuteRunbookDeploymentConfig({ DEPLOY_ENV: 'dev' }), /DEPLOY_REGION/);
    assert.throws(
      () =>
        loadExecuteRunbookDeploymentConfig({
          ...BASE_ENV,
          DEPLOY_REGION: 'eu-south-1',
          EXECUTE_RUNBOOK_WORKER_SUBNET_AZ: 'eu-south-1a',
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
