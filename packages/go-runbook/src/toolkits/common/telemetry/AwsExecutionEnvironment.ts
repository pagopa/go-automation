import type { ExecutionEnvironment } from '../../../engine/index.js';

/**
 * Environment of an operational execution: the AWS profiles and region are
 * required.
 */
export type AwsExecutionEnvironment = ExecutionEnvironment &
  Required<Pick<ExecutionEnvironment, 'awsProfiles' | 'region'>>;
