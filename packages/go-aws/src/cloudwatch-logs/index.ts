/**
 * @pagopa/go-aws/cloudwatch-logs — requires the peer `@aws-sdk/client-cloudwatch-logs`.
 * The SDK-free helpers and contract types live in `@pagopa/go-aws/cloudwatch-logs/insights`;
 * the contract types are re-exported here so that code using the service needs a single import.
 */

export { CLOUDWATCH_LOGS_CLIENT } from './CLOUDWATCH_LOGS_CLIENT.js';
export { AWSCloudWatchLogsService, isAWSCloudWatchLogsConfigurationError } from './AWSCloudWatchLogsService.js';
export type {
  AWSCloudWatchLogsConfigurationError,
  AWSCloudWatchLogsConfigurationErrorCode,
} from './AWSCloudWatchLogsService.js';
export type {
  AWSCloudWatchLogsLogGroupResolutionMode,
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryExecution,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsQueryService,
  AWSCloudWatchLogsTimeRange,
  AWSCloudWatchLogsTarget,
  AWSCloudWatchLogsSource,
} from './insights/index.js';
export type { CloudWatchLogsClient, ResultField } from '@aws-sdk/client-cloudwatch-logs';
