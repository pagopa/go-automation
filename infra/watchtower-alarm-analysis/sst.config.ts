/// <reference path="./.sst/platform/config.d.ts" />

const deployEnvironment = requiredEnvironment('DEPLOY_ENV');
const deployRegion = requiredEnvironment('DEPLOY_REGION');
const deployKind = process.env['DEPLOY_KIND']?.trim() ?? 'monitoring';
if (deployKind !== 'monitoring' && deployKind !== 'source-link') {
  throw new Error(`DEPLOY_KIND must be monitoring or source-link, received ${deployKind}`);
}
const expectedStage = `${deployEnvironment}-${deployRegion}`;

export default $config({
  app(input) {
    if (input.stage !== expectedStage) {
      throw new Error(`Expected SST stage ${expectedStage}, received ${input.stage}`);
    }
    return {
      name: 'go-execute-runbook',
      home: 'aws',
      protect: deployEnvironment === 'production',
      removal: deployEnvironment === 'production' ? 'retain-all' : 'remove',
      version: '4.15.2',
      providers: {
        aws: {
          region: deployRegion,
          ...(process.env['AWS_PROFILE'] === undefined ? {} : { profile: process.env['AWS_PROFILE'] }),
        },
      },
    };
  },
  async run() {
    const {
      EXECUTE_RUNBOOK_MAX_RECEIVE_COUNT,
      EXECUTE_RUNBOOK_MESSAGE_RETENTION_SECONDS,
      EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION,
      EXECUTE_RUNBOOK_VISIBILITY_TIMEOUT_SECONDS,
      buildExecuteRunbookMonitoringPlan,
      buildWorkerIamPolicy,
      loadExecuteRunbookDeploymentConfig,
      loadExecuteRunbookSourceLinkDeploymentConfig,
    } = await import('./src/index.js');
    if (deployKind === 'source-link') {
      const sourceConfig = loadExecuteRunbookSourceLinkDeploymentConfig(process.env);
      const link = new aws.oam.Link('ExecuteRunbookOamSourceLink', {
        labelTemplate: sourceConfig.labelTemplate,
        linkConfiguration: {
          logGroupConfiguration: { filter: sourceConfig.logGroupFilter },
        },
        resourceTypes: ['AWS::Logs::LogGroup'],
        sinkIdentifier: sourceConfig.sinkArn,
      });
      return {
        deploymentKind: deployKind,
        oamLinkArn: link.arn,
        oamSinkArn: sourceConfig.sinkArn,
        region: sourceConfig.region,
      };
    }
    const config = loadExecuteRunbookDeploymentConfig(process.env);
    const plan = buildExecuteRunbookMonitoringPlan(config);
    const workerIam = buildWorkerIamPolicy({
      region: config.region,
      logGroupArns: config.oamSourceAccountIds.map(
        (accountId) => `arn:aws:logs:${config.region}:${accountId}:log-group:*`,
      ),
      athenaWorkgroupArns: [],
      athenaResultObjectArns: [],
      servicePrincipalSecretArn: config.servicePrincipalSecretArn,
    });
    const dlq = new sst.aws.Queue('ExecuteRunbookDlq', {
      fifo: true,
      transform: {
        queue: {
          name: plan.names.dlqName,
          messageRetentionSeconds: EXECUTE_RUNBOOK_MESSAGE_RETENTION_SECONDS,
          sqsManagedSseEnabled: true,
        },
      },
    });

    const queue = new sst.aws.Queue('ExecuteRunbookQueue', {
      fifo: true,
      visibilityTimeout: `${EXECUTE_RUNBOOK_VISIBILITY_TIMEOUT_SECONDS} seconds`,
      dlq: { queue: dlq.arn, retry: EXECUTE_RUNBOOK_MAX_RECEIVE_COUNT },
      transform: {
        queue: {
          name: plan.names.queueName,
          messageRetentionSeconds: EXECUTE_RUNBOOK_MESSAGE_RETENTION_SECONDS,
          sqsManagedSseEnabled: true,
        },
      },
    });

    new aws.sqs.QueuePolicy('ExecuteRunbookQueuePolicy', {
      queueUrl: queue.url,
      policy: $jsonStringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'WatchtowerDispatchOnly',
            Effect: 'Allow',
            Principal: { AWS: [...plan.queueSendPrincipals] },
            Action: 'sqs:SendMessage',
            Resource: queue.arn,
          },
        ],
      }),
    });

    const sink = new aws.oam.Sink('ExecuteRunbookOamSink', { name: plan.names.oamSinkName });
    new aws.oam.SinkPolicy('ExecuteRunbookOamSinkPolicy', {
      sinkIdentifier: sink.id,
      policy: $jsonStringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'ApprovedSourceAccountsLogsOnly',
            Effect: 'Allow',
            Principal: { AWS: config.oamSourceAccountIds.map((accountId) => `arn:aws:iam::${accountId}:root`) },
            Action: ['oam:CreateLink', 'oam:UpdateLink'],
            Resource: '*',
            Condition: {
              'ForAllValues:StringEquals': { 'oam:ResourceTypes': ['AWS::Logs::LogGroup'] },
            },
          },
        ],
      }),
    });

    queue.subscribe(
      {
        name: plan.names.lambdaName,
        handler: '../../functions/go-ExecuteRunbookLambda/src/handler.handler',
        runtime: plan.runtime,
        architecture: plan.architecture,
        timeout: `${plan.lambdaTimeoutSeconds} seconds`,
        concurrency: { reserved: plan.reservedConcurrency },
        vpc: {
          privateSubnets: [...config.subnetIds],
          securityGroups: [config.lambdaSecurityGroupId],
        },
        environment: {
          WATCHTOWER_URL: config.watchtowerInternalUrl,
          WATCHTOWER_SERVICE_ID: 'runbook-automation-worker',
          WATCHTOWER_SERVICE_SECRET_ARN: config.servicePrincipalSecretArn,
        },
        permissions: workerIam.map((statement) => ({
          actions: [...statement.actions],
          resources: [...statement.resources],
          ...(statement.conditions === undefined
            ? {}
            : {
                conditions: Object.entries(statement.conditions).flatMap(([test, variables]) =>
                  Object.entries(variables).map(([variable, value]) => ({ test, variable, values: [value] })),
                ),
              }),
        })),
        logging: { logGroup: plan.names.logGroupName, format: 'json', retention: '1 month' },
      },
      { batch: { size: plan.batchSize, partialResponses: plan.partialBatchResponse } },
    );

    return {
      deploymentKind: deployKind,
      queueUrl: queue.url,
      queueArn: queue.arn,
      dlqArn: dlq.arn,
      oamSinkArn: sink.arn,
      workerName: plan.names.lambdaName,
      queueRegistryControlRegion: EXECUTE_RUNBOOK_REGISTRY_CONTROL_REGION,
      queueRegistryParameter: `/go-automation/${config.environment}/execute-runbook/queue-registry-v1`,
      registryFragment: $jsonStringify({
        awsRegion: config.region,
        queueUrl: queue.url,
        queueArn: queue.arn,
        stackName: plan.names.stackName,
        messageRetentionSeconds: plan.messageRetentionSeconds,
      }),
    };
  },
});

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') throw new Error(`Missing required environment variable ${name}`);
  return value;
}
