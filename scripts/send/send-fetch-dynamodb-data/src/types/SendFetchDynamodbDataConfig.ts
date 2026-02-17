/**
 * Script configuration interface
 * Represents all validated configuration parameters
 */
export interface SendFetchDynamodbDataConfig {
  /** AWS profile name for SSO authentication */
  readonly awsProfile: string;

  /** Input PK file path */
  readonly inputPkfile: string;

  /** Output JSON file path */
  readonly outputFile: string;

  /** Output format: json or ndjson */
  readonly outputFormat: 'json' | 'ndjson';

  /** DynamoDB table name */
  readonly tableName: string;

  /** Name of the partition key attribute in the DynamoDB table */
  readonly tableKey: string;

  /** Optional prefix to prepend to each PK value */
  readonly keyPrefix?: string;

  /** Optional suffix to append to each PK value */
  readonly keySuffix?: string;
}
