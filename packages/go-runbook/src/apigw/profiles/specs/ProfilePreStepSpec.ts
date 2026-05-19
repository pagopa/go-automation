import type { TimeRangeFromParams } from '../../../steps/data/CloudWatchLogsQueryStep.js';

/**
 * Profile-level pre-step declarations that can be materialised by the
 * API Gateway runbook builder.
 */
export type ProfilePreStepSpec = LambdaDurationProbeProfilePreStepSpec;

/**
 * Lambda REPORT-duration probe associated with a query profile.
 */
export interface LambdaDurationProbeProfilePreStepSpec {
  /** Discriminant used by the builder to choose the materialisation logic. */
  readonly kind: 'lambda-duration-probe';
  /** CloudWatch log group of the Lambda to query. */
  readonly logGroup: string;
  /** Optional step id prefix. Defaults to the factory default. */
  readonly idPrefix?: string;
  /** Optional human-readable label. Defaults to the Lambda log group suffix. */
  readonly label?: string;
  /** Optional vars prefix. Defaults to the factory default. */
  readonly varPrefix?: string;
  /** Optional minimum duration in milliseconds. Defaults to the factory default. */
  readonly thresholdMs?: number;
  /** Optional query time range mapping. Defaults to the factory default. */
  readonly timeRangeFromParams?: TimeRangeFromParams;
  /** Optional query template override. Must contain `{{THRESHOLD_MS}}`. */
  readonly queryTemplate?: string;
  /** Optional extra trace metadata. The builder always adds the profile id. */
  readonly traceMetadata?: Readonly<Record<string, unknown>>;
}
