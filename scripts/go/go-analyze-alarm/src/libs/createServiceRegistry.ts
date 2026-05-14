/**
 * Factory for creating the AWS ServiceRegistry from the script AWS provider.
 */

import {
  CloudWatchMetricsService,
  AthenaService,
  RunbookDynamoDBService,
  RunbookHttpService,
} from '@go-automation/go-runbook';
import { Core } from '@go-automation/go-common';
import type { ServiceRegistry } from '@go-automation/go-runbook';

/**
 * Creates a ServiceRegistry from the unified script AWS provider.
 *
 * CloudWatch Logs uses the multi-profile service because runbooks may need to
 * resolve log groups across the configured account list. Other services keep
 * the first-profile behavior used by the previous implementation.
 *
 * @param script - GOScript instance with initialized AWS providers
 * @returns ServiceRegistry with all services initialized
 */
export function createServiceRegistry(script: Core.GOScript): ServiceRegistry {
  return {
    cloudWatchLogs: script.aws.services.cloudWatchLogs,
    cloudWatchMetrics: new CloudWatchMetricsService(script.aws.clients.cloudWatch),
    athena: new AthenaService(script.aws.clients.athena, 's3://placeholder-athena-results/'),
    dynamodb: new RunbookDynamoDBService(script.aws.clients.dynamoDB),
    http: new RunbookHttpService(),
  };
}
