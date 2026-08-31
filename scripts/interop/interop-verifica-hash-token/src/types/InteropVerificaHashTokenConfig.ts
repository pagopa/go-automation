/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface InteropVerificaHashTokenConfig {
  /** AWS profile name */
  readonly awsProfile: string;
  /** AWS region */
  readonly awsRegion?: string;
  /** CloudWatch Log Group Name */
  readonly cwLogGroup: string;
  /** CloudWatch Logs query string for application logs */
  readonly cwQueryApplication?: string;
  /** CloudWatch Logs query string for CID log details */
  readonly cwQueryCid?: string;
  /** S3 bucket name for NDJSON tokens */
  readonly s3BucketNameNdjson: string;
  /** S3 prefix for NDJSON tokens */
  readonly s3PrefixNdjson?: string;
  /** S3 bucket name for signed P7M tokens */
  readonly s3BucketNameP7m: string;
  /** S3 prefix for signed P7M tokens */
  readonly s3PrefixP7m?: string;
  /** Start time in UTC */
  readonly startUtc: string;
  /** End time in UTC */
  readonly endUtc: string;
}
