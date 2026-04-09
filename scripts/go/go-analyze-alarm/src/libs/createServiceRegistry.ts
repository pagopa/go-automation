/**
 * Factory for creating the AWS ServiceRegistry from an SSO profile.
 */

import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { AthenaClient } from '@aws-sdk/client-athena';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { fromIni } from '@aws-sdk/credential-provider-ini';

import { Runbook } from '@go-automation/go-common';

/**
 * Creates a ServiceRegistry from an AWS SSO profile.
 *
 * @param profile - AWS SSO profile name
 * @returns ServiceRegistry with all services initialized
 */
export function createServiceRegistry(profile: string): Runbook.ServiceRegistry {
  const credentials = fromIni({ profile });
  const region = 'eu-south-1';

  const cloudWatchLogsClient = new CloudWatchLogsClient({ region, credentials });
  const cloudWatchClient = new CloudWatchClient({ region, credentials });
  const athenaClient = new AthenaClient({ region, credentials });
  const dynamoDBClient = new DynamoDBClient({ region, credentials });

  return {
    cloudWatchLogs: new Runbook.CloudWatchLogsService(cloudWatchLogsClient),
    cloudWatchMetrics: new Runbook.CloudWatchMetricsService(cloudWatchClient),
    athena: new Runbook.AthenaService(athenaClient, 's3://placeholder-athena-results/'),
    dynamodb: new Runbook.RunbookDynamoDBService(dynamoDBClient),
    http: new Runbook.RunbookHttpService(),
  };
}
