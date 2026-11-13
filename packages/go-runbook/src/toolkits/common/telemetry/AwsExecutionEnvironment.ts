import type { ExecutionEnvironment } from '../../../engine/tracing/ExecutionEnvironment.js';

/**
 * Environment of an operational execution: the AWS profiles and region are
 * required (EVO-RBREORG-OPUS-01 §7.1.3 C, RBREORG-20).
 */
export type AwsExecutionEnvironment = ExecutionEnvironment &
  Required<Pick<ExecutionEnvironment, 'awsProfiles' | 'region'>>;
