/**
 * @pagopa/go-aws/cloudwatch-logs — requires the peer `@aws-sdk/client-cloudwatch-logs`.
 * The SDK-free helpers live in `@pagopa/go-aws/cloudwatch-logs/insights`.
 */

export { CLOUDWATCH_LOGS_CLIENT } from './CLOUDWATCH_LOGS_CLIENT.js';
export { AWSCloudWatchLogsService, isAWSCloudWatchLogsConfigurationError } from './AWSCloudWatchLogsService.js';
export type {
  AWSCloudWatchLogsLogGroupResolutionMode,
  AWSCloudWatchLogsConfigurationError,
  AWSCloudWatchLogsConfigurationErrorCode,
  AWSCloudWatchLogsQueryOptions,
  AWSCloudWatchLogsQueryExecution,
  AWSCloudWatchLogsQueryResult,
  AWSCloudWatchLogsTimeRange,
  AWSCloudWatchLogsTarget,
  AWSCloudWatchLogsSource,
} from './AWSCloudWatchLogsService.js';
export type { CloudWatchLogsClient, ResultField } from '@aws-sdk/client-cloudwatch-logs';
