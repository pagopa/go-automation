import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { GOHttpClient } from '@pagopa/go-common/http';

import type { RunbookAthenaPort } from './ports/RunbookAthenaPort.js';
import type { RunbookCloudWatchMetricsPort } from './ports/RunbookCloudWatchMetricsPort.js';
import type { RunbookDynamoDBPort } from './ports/RunbookDynamoDBPort.js';
import type { RunbookReporter } from '../../../engine/reporting/RunbookReporter.js';

/**
 * Registry of collaborators available to runbook steps.
 *
 * The AWS collaborators are typed by SDK-free contracts (the go-aws Logs
 * Insights contract and the runbook ports), which the concrete go-aws services
 * satisfy structurally: the engine's declaration files therefore need no
 * `@aws-sdk/*` package. Execution-scoped helpers such as CloudWatch Logs
 * `forTarget` and Athena `forExecution` stay part of the contracts. {@link RunbookReporter} lives here for the same reason the
 * AWS services do: it is an injected collaborator with side effects, not part of
 * the execution state.
 */
export interface ServiceRegistry {
  readonly cloudWatchLogs: AWSCloudWatchLogsQueryService;
  readonly cloudWatchMetrics: RunbookCloudWatchMetricsPort;
  readonly athena: RunbookAthenaPort;
  readonly dynamodb: RunbookDynamoDBPort;
  readonly http: GOHttpClient;
  /** Narrative channel: steps describe what they observed. */
  readonly reporter: RunbookReporter;
}
