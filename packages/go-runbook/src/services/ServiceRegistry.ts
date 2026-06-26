import type {
  AWSAthenaService,
  AWSCloudWatchLogsService,
  AWSCloudWatchMetricsService,
  AWSDynamoDBService,
} from '@go-automation/go-common/aws';
import type { GOHttpClient } from '@go-automation/go-common/core';

/**
 * Registry of services available to runbook steps.
 * Uses the concrete GO AWS service wrappers so execution-scoped helpers
 * such as CloudWatch Logs `forTarget` and Athena `forExecution` remain
 * available to orchestration code.
 */
export interface ServiceRegistry {
  readonly cloudWatchLogs: AWSCloudWatchLogsService;
  readonly cloudWatchMetrics: AWSCloudWatchMetricsService;
  readonly athena: AWSAthenaService;
  readonly dynamodb: AWSDynamoDBService;
  readonly http: GOHttpClient;
}
