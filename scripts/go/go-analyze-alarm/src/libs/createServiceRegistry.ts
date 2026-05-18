/**
 * Factory for creating the AWS ServiceRegistry from the script AWS provider.
 */

import { RunbookHttpService } from '@go-automation/go-runbook';
import { Core } from '@go-automation/go-common';
import type { ServiceRegistry } from '@go-automation/go-runbook';

const ATHENA_OUTPUT_LOCATION = 's3://placeholder-athena-results/';

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
    cloudWatchMetrics: script.aws.services.cloudWatchMetrics,
    athena: script.aws.services.getAthena(ATHENA_OUTPUT_LOCATION),
    dynamodb: script.aws.services.dynamoDB,
    http: new RunbookHttpService(),
  };
}
