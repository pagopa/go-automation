/**
 * Configuration interface for the TPP Messages Monitor script
 * Maps to GOScript configuration parameters
 */
export interface TPPMonitorConfig {
  /** Start date for the query range */
  readonly from: string;

  /** End date for the query range */
  readonly to: string;

  /** AWS SSO profile name (optional in AWS-managed environments) */
  readonly awsProfile?: string;

  /** AWS region (default: eu-south-1) */
  readonly awsRegion: string;

  /** Athena database name */
  readonly athenaDatabase: string;

  /** Athena data catalog (default: AwsDataCatalog) */
  readonly athenaCatalog: string;

  /** Athena workgroup (default: primary) */
  readonly athenaWorkgroup: string;

  /** S3 output location for Athena query results */
  readonly athenaOutputLocation: string;

  /** Maximum retries for query status polling */
  readonly athenaMaxRetries: number;

  /** Delay between retries in milliseconds */
  readonly athenaRetryDelay: number;

  /** SQL query template with placeholders */
  readonly athenaQuery: string;

  /** Slack bot token (optional) */
  readonly slackToken?: string;

  /** Slack channel ID or name (optional) */
  readonly slackChannel?: string;

  /** Slack message template (optional) */
  readonly slackMessageTemplate?: string;

  /** Threshold field for analysis (optional) */
  readonly analysisThresholdField?: string;

  /** Threshold value for analysis (optional) */
  readonly analysisThreshold?: number;

  /** Reports output folder */
  readonly reportsFolder: string;
}
