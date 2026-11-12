import type { AWSAthenaService } from '@pagopa/go-aws/athena';
import type { AWSCloudWatchLogsService } from '@pagopa/go-aws/cloudwatch-logs';
import type { AWSCloudWatchMetricsService } from '@pagopa/go-aws/cloudwatch-metrics';
import type { AWSDynamoDBService } from '@pagopa/go-aws/dynamodb';
import type { GOHttpClient } from '@pagopa/go-common/http';

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
