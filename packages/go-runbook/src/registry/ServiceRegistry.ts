import type {
  AWSAthenaService,
  AWSCloudWatchLogsService,
  AWSCloudWatchMetricsService,
  AWSDynamoDBService,
} from '@go-automation/go-common/aws';
import type { GOHttpClient } from '@go-automation/go-common/core';

import type { RunbookReporter } from './RunbookReporter.js';

/**
 * Registry of collaborators available to runbook steps.
 *
 * Uses the concrete GO AWS service wrappers so execution-scoped helpers such as
 * CloudWatch Logs `forTarget` and Athena `forExecution` remain available to
 * orchestration code. {@link RunbookReporter} lives here for the same reason the
 * AWS services do: it is an injected collaborator with side effects, not part of
 * the execution state.
 */
export interface ServiceRegistry {
  readonly cloudWatchLogs: AWSCloudWatchLogsService;
  readonly cloudWatchMetrics: AWSCloudWatchMetricsService;
  readonly athena: AWSAthenaService;
  readonly dynamodb: AWSDynamoDBService;
  readonly http: GOHttpClient;
  /** Narrative channel: steps describe what they observed. */
  readonly reporter: RunbookReporter;
}
