import type { ExecutionEnvironment } from '../../../engine/tracing/ExecutionEnvironment.js';

/**
 * Environment of an operational execution: the AWS profiles and region are
 * required.
 */
export type AwsExecutionEnvironment = ExecutionEnvironment &
  Required<Pick<ExecutionEnvironment, 'awsProfiles' | 'region'>>;
