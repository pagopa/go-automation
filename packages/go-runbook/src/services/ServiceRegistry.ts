import type { AthenaQueryService } from './AthenaQueryService.js';
import type { RunbookHttpService } from './RunbookHttpService.js';
import type { CloudWatchLogsQueryService } from './CloudWatchLogsQueryService.js';
import type { CloudWatchMetricsQueryService } from './CloudWatchMetricsQueryService.js';
import type { DynamoDBOperationsService } from './DynamoDBOperationsService.js';

/**
 * Registry of services available to runbook steps.
 * Follows the dependency injection pattern for testability.
 */
export interface ServiceRegistry {
  readonly cloudWatchLogs: CloudWatchLogsQueryService;
  readonly cloudWatchMetrics: CloudWatchMetricsQueryService;
  readonly athena: AthenaQueryService;
  readonly dynamodb: DynamoDBOperationsService;
  readonly http: RunbookHttpService;
}
