import type { AWSCloudWatchLogsQueryService } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { GOHttpClient } from '@pagopa/go-common/http';

import type { RunbookAthenaPort } from './ports/RunbookAthenaPort.js';
import type { RunbookCloudWatchMetricsPort } from './ports/RunbookCloudWatchMetricsPort.js';
import type { RunbookDynamoDBPort } from './ports/RunbookDynamoDBPort.js';
import type { WorkflowServices } from '../../../engine/types/WorkflowServices.js';

/**
 * Registry of collaborators available to runbook steps.
 *
 * The AWS collaborators are typed by SDK-free contracts (the go-aws Logs
 * Insights contract and the runbook ports), which the concrete go-aws services
 * satisfy structurally: the engine's declaration files therefore need no
 * `@aws-sdk/*` package. Execution-scoped helpers such as CloudWatch Logs
 * `forTarget` and Athena `forExecution` stay part of the contracts. It extends
 * the engine's {@link WorkflowServices} (the reporter) with the operational
 * ports (EVO-RBREORG-OPUS-01 §7.1.3 A).
 */
export interface ServiceRegistry extends WorkflowServices {
  readonly cloudWatchLogs: AWSCloudWatchLogsQueryService;
  readonly cloudWatchMetrics: RunbookCloudWatchMetricsPort;
  readonly athena: RunbookAthenaPort;
  readonly dynamodb: RunbookDynamoDBPort;
  readonly http: GOHttpClient;
}
