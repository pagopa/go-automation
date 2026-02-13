import type { RunbookDynamoDBService } from './RunbookDynamoDBService.js';
import type { RunbookHttpService } from './RunbookHttpService.js';
import type { CloudWatchLogsService } from './CloudWatchLogsService.js';
import type { CloudWatchMetricsService } from './CloudWatchMetricsService.js';
import type { AthenaService } from './AthenaService.js';

/**
 * Registry of services available to runbook steps.
 * Follows the dependency injection pattern for testability.
 */
export interface ServiceRegistry {
  readonly cloudWatchLogs: CloudWatchLogsService;
  readonly cloudWatchMetrics: CloudWatchMetricsService;
  readonly athena: AthenaService;
  readonly dynamodb: RunbookDynamoDBService;
  readonly http: RunbookHttpService;
}
