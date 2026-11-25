/**
 * Configuration for executing an Athena query
 */
export interface AthenaQueryConfig {
  /** Athena database name */
  readonly database: string;

  /** Athena data catalog */
  readonly catalog: string;

  /** Athena workgroup */
  readonly workGroup: string;

  /** S3 output location for query results */
  readonly outputLocation: string;

  /** Maximum number of retries for query status polling */
  readonly maxRetries: number;

  /** Delay between retries in milliseconds */
  readonly retryDelay: number;
}
